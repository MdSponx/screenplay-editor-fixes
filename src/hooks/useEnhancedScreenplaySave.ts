import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp, 
  updateDoc,
  increment,
  collection,
  query,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ScreenplaySaveManager } from '../lib/screenplay/saveManager';
import { segmentBlocksIntoScenes } from '../utils/blockUtils';
import type { Block, PersistedEditorState, SceneDocument } from '../types';
import type { SaveResult, Screenplay } from '../types/screenplay';

export type SaveStatus = 
  | 'saved'           // All changes saved
  | 'saving'          // Currently saving
  | 'pending'         // Changes pending save
  | 'queued'          // Changes queued for save
  | 'syncing'         // Syncing with server
  | 'conflict'        // Merge conflict detected
  | 'error'           // Save error occurred
  | 'offline'         // No network connection
  | 'auto-saving';    // Auto-save in progress

export interface EnhancedSaveState {
  status: SaveStatus;
  lastSaved: Date | null;
  syncQueue: number;
  networkStatus: 'online' | 'offline';
  autoSaveEnabled: boolean;
  conflictCount: number;
  errorMessage: string | null;
  isSaving: boolean;
  hasChanges: boolean;
}

export const useEnhancedScreenplaySave = (
  projectId: string | undefined,
  screenplayId: string | null,
  userId: string,
  blocks: Block[],
  activeBlock: string | null
) => {
  // Reference to the save manager
  const saveManagerRef = useRef<ScreenplaySaveManager | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastChangeTimeRef = useRef<number>(0);
  const saveQueueRef = useRef<number>(0);

  // Enhanced state management
  const [saveState, setSaveState] = useState<EnhancedSaveState>({
    status: 'saved',
    lastSaved: null,
    syncQueue: 0,
    networkStatus: 'online',
    autoSaveEnabled: true,
    conflictCount: 0,
    errorMessage: null,
    isSaving: false,
    hasChanges: false
  });

  // Network connectivity monitoring
  useEffect(() => {
    const handleOnline = () => {
      setSaveState(prev => ({
        ...prev,
        networkStatus: 'online',
        status: prev.status === 'offline' ? 'pending' : prev.status
      }));
    };

    const handleOffline = () => {
      setSaveState(prev => ({
        ...prev,
        networkStatus: 'offline',
        status: 'offline'
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial network status check
    setSaveState(prev => ({
      ...prev,
      networkStatus: navigator.onLine ? 'online' : 'offline'
    }));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Validate required parameters
  useEffect(() => {
    if (!projectId) {
      setSaveState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Project ID is required'
      }));
      return;
    }

    if (!screenplayId) {
      setSaveState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Screenplay ID is required'
      }));
      return;
    }

    if (!userId) {
      setSaveState(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'User ID is required'
      }));
      return;
    }

    // Clear error if all required parameters are present
    setSaveState(prev => ({
      ...prev,
      status: prev.status === 'error' ? 'saved' : prev.status,
      errorMessage: null
    }));
  }, [projectId, screenplayId, userId]);

  // Initialize save manager when component mounts
  useEffect(() => {
    const initializeSaveManager = async () => {
      if (!projectId || !userId || !screenplayId) {
        console.warn('Missing required parameters for save manager initialization');
        return;
      }
      
      try {
        console.log(`Initializing enhanced save manager with projectId: ${projectId}, screenplayId: ${screenplayId}`);
        
        // Get the screenplay data
        const screenplayRef = doc(db, `projects/${projectId}/screenplays`, screenplayId);
        const screenplaySnap = await getDoc(screenplayRef);
        
        if (screenplaySnap.exists()) {
          const screenplayData = screenplaySnap.data();
          
          // Ensure the screenplay data has the correct IDs and types
          const screenplay: Screenplay = {
            ...screenplayData,
            id: screenplayId,
            projectId: projectId,
            lastModified: screenplayData.lastModified || Timestamp.now(),
            version: screenplayData.version || 1,
            collaborators: screenplayData.collaborators || [userId],
            status: screenplayData.status || 'Draft',
            total_blocks_in_screenplay: screenplayData.total_blocks_in_screenplay || 0,
            total_scenes_in_screenplay: screenplayData.total_scenes_in_screenplay || 0,
            title: screenplayData.title || 'Untitled Screenplay',
            header_content: screenplayData.header_content || {
              title: screenplayData.title || 'Untitled Screenplay',
              author: userId,
              contact: ''
            },
            metadata: {
              format: screenplayData.metadata?.format || 'Movie',
              author: screenplayData.metadata?.author || userId,
              createdAt: screenplayData.metadata?.createdAt || Timestamp.now(),
              tags: screenplayData.metadata?.tags || []
            }
          } as Screenplay;
          
          // Create a new save manager instance
          saveManagerRef.current = new ScreenplaySaveManager(screenplay, userId);
          console.log('Enhanced save manager initialized with existing screenplay data');
        } else {
          console.log('Screenplay not found, creating default enhanced save manager');
          
          // Create a default screenplay data object with explicit IDs
          const defaultScreenplayData: Screenplay = {
            id: screenplayId,
            title: 'Untitled Screenplay',
            projectId: projectId,
            lastModified: Timestamp.now(),
            version: 1,
            collaborators: [userId],
            status: 'Draft' as const,
            metadata: {
              format: 'Movie' as const,
              author: userId,
              createdAt: Timestamp.now(),
              tags: []
            },
            total_blocks_in_screenplay: 0,
            total_scenes_in_screenplay: 0,
            header_content: {
              title: 'Untitled Screenplay',
              author: userId,
              contact: ''
            }
          };
          
          // Create a new save manager instance with the default screenplay
          saveManagerRef.current = new ScreenplaySaveManager(defaultScreenplayData, userId);
        }
        
        // Buffer initial blocks if available
        if (saveManagerRef.current && blocks.length > 0) {
          saveManagerRef.current.bufferChanges(blocks);
        }
      } catch (err) {
        console.error('Error initializing enhanced save manager:', err);
        setSaveState(prev => ({
          ...prev,
          status: 'error',
          errorMessage: 'Failed to initialize save manager'
        }));
      }
    };
    
    initializeSaveManager();
    
    // Cleanup save manager on unmount
    return () => {
      if (saveManagerRef.current) {
        saveManagerRef.current.cleanup();
        saveManagerRef.current = null;
      }
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [projectId, userId, screenplayId, blocks]);

  // Auto-save functionality with debouncing
  const scheduleAutoSave = useCallback(() => {
    if (!saveState.autoSaveEnabled || saveState.networkStatus === 'offline') {
      return;
    }

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Schedule auto-save after 3 seconds of inactivity
    autoSaveTimeoutRef.current = setTimeout(async () => {
      if (saveState.hasChanges && !saveState.isSaving) {
        setSaveState(prev => ({ ...prev, status: 'auto-saving' }));
        
        try {
          const result = await performSave();
          if (result.success) {
            setSaveState(prev => ({
              ...prev,
              status: 'saved',
              lastSaved: new Date(),
              hasChanges: false,
              syncQueue: 0,
              errorMessage: null
            }));
          } else {
            setSaveState(prev => ({
              ...prev,
              status: 'error',
              errorMessage: result.error || 'Auto-save failed'
            }));
          }
        } catch (err) {
          console.error('Auto-save error:', err);
          setSaveState(prev => ({
            ...prev,
            status: 'error',
            errorMessage: 'Auto-save failed'
          }));
        }
      }
    }, 3000);
  }, [saveState.autoSaveEnabled, saveState.networkStatus, saveState.hasChanges, saveState.isSaving]);

  // Watch for changes to mark content as unsaved and schedule auto-save
  useEffect(() => {
    const now = Date.now();
    lastChangeTimeRef.current = now;
    
    setSaveState(prev => ({
      ...prev,
      hasChanges: true,
      status: prev.status === 'saved' ? 'pending' : prev.status,
      syncQueue: prev.syncQueue + 1
    }));
    
    // Buffer changes in save manager
    if (saveManagerRef.current && blocks.length > 0) {
      saveManagerRef.current.bufferChanges(blocks);
    }

    // Schedule auto-save
    scheduleAutoSave();
  }, [blocks, scheduleAutoSave]);

  // Core save function
  const performSave = useCallback(async (): Promise<SaveResult> => {
    if (!projectId || !screenplayId || !userId) {
      return { 
        success: false, 
        error: 'Missing required parameters' 
      };
    }

    try {
      // If we have a save manager, use it
      if (saveManagerRef.current) {
        console.log(`Using enhanced save manager to save screenplay ${screenplayId} in project ${projectId}`);
        
        // Ensure the save manager has the correct project ID
        saveManagerRef.current.updateProjectId(projectId);
        
        const result = await saveManagerRef.current.saveScreenplay();
        return result;
      }
      
      // Fallback to direct save if save manager is not available
      console.log(`Save manager not available, using direct save for screenplay ${screenplayId} in project ${projectId}`);
      
      // Segment blocks into scenes
      const scenes = segmentBlocksIntoScenes(blocks);
      
      // Set projectId and screenplayId on all scenes
      scenes.forEach(scene => {
        scene.projectId = projectId;
        scene.screenplayId = screenplayId;
        scene.lastModified = Timestamp.now();
      });
      
      // Save each scene
      for (const scene of scenes) {
        const sceneRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/scenes`, scene.id);
        await setDoc(sceneRef, scene, { merge: true });
      }
      
      // Update screenplay metadata
      const screenplayRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}`);
      await updateDoc(screenplayRef, {
        total_blocks_in_screenplay: blocks.length,
        total_scenes_in_screenplay: scenes.length,
        lastModified: serverTimestamp(),
        version: increment(1)
      });
      
      // Update editor state (without blocks)
      const editorStateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
      const editorStateSnap = await getDoc(editorStateRef);
      
      const persistedEditorState: Partial<PersistedEditorState> = {
        activeBlock: activeBlock,
        selectedBlocks: [],
        editingHeader: false,
        lastModified: new Date()
      };
      
      if (editorStateSnap.exists()) {
        await updateDoc(editorStateRef, persistedEditorState);
      } else {
        await setDoc(editorStateRef, {
          ...persistedEditorState,
          header: { 
            title: 'Untitled Screenplay', 
            author: userId, 
            contact: '' 
          }
        });
      }

      return { success: true };
    } catch (err) {
      console.error('Error saving screenplay:', err);
      return { 
        success: false, 
        error: 'Failed to save screenplay' 
      };
    }
  }, [projectId, screenplayId, userId, blocks, activeBlock]);

  // Manual save function
  const handleSave = useCallback(async (): Promise<SaveResult> => {
    if (saveState.isSaving || !saveState.hasChanges) {
      return { success: true };
    }

    setSaveState(prev => ({
      ...prev,
      isSaving: true,
      status: 'saving',
      errorMessage: null
    }));

    try {
      const result = await performSave();
      
      if (result.success) {
        setSaveState(prev => ({
          ...prev,
          isSaving: false,
          status: 'saved',
          hasChanges: false,
          lastSaved: new Date(),
          syncQueue: 0,
          conflictCount: 0,
          errorMessage: null
        }));
      } else {
        setSaveState(prev => ({
          ...prev,
          isSaving: false,
          status: result.conflicts ? 'conflict' : 'error',
          conflictCount: result.conflicts ? result.conflicts.length : 0,
          errorMessage: result.error || 'Failed to save screenplay'
        }));
      }
      
      return result;
    } catch (err) {
      console.error('Error in handleSave:', err);
      const errorMessage = 'Failed to save screenplay';
      
      setSaveState(prev => ({
        ...prev,
        isSaving: false,
        status: 'error',
        errorMessage
      }));
      
      return { success: false, error: errorMessage };
    }
  }, [saveState.isSaving, saveState.hasChanges, performSave]);

  // Function to manually set changes state
  const setHasChanges = useCallback((hasChanges: boolean) => {
    setSaveState(prev => ({
      ...prev,
      hasChanges,
      status: hasChanges ? 'pending' : 'saved',
      syncQueue: hasChanges ? prev.syncQueue : 0
    }));
  }, []);

  // Function to toggle auto-save
  const toggleAutoSave = useCallback(() => {
    setSaveState(prev => ({
      ...prev,
      autoSaveEnabled: !prev.autoSaveEnabled
    }));
  }, []);

  // Function to clear errors
  const clearError = useCallback(() => {
    setSaveState(prev => ({
      ...prev,
      status: prev.hasChanges ? 'pending' : 'saved',
      errorMessage: null,
      conflictCount: 0
    }));
  }, []);

  // Function to get human-readable status message
  const getStatusMessage = useCallback((): string => {
    switch (saveState.status) {
      case 'saved':
        return saveState.lastSaved 
          ? `Saved ${formatTimeAgo(saveState.lastSaved)}`
          : 'Saved';
      case 'saving':
        return 'Saving...';
      case 'auto-saving':
        return 'Auto-saving...';
      case 'pending':
        return saveState.syncQueue > 1 
          ? `${saveState.syncQueue} changes pending`
          : 'Changes pending';
      case 'queued':
        return `${saveState.syncQueue} changes queued`;
      case 'syncing':
        return 'Syncing...';
      case 'conflict':
        return saveState.conflictCount > 1
          ? `${saveState.conflictCount} conflicts`
          : 'Conflict detected';
      case 'error':
        return saveState.errorMessage || 'Save error';
      case 'offline':
        return 'Offline - changes queued';
      default:
        return 'Unknown status';
    }
  }, [saveState]);

  return {
    // Enhanced state
    saveState,
    
    // Legacy compatibility
    isSaving: saveState.isSaving,
    hasChanges: saveState.hasChanges,
    error: saveState.errorMessage,
    
    // Functions
    handleSave,
    setHasChanges,
    toggleAutoSave,
    clearError,
    getStatusMessage,
    
    // Additional utilities
    isOnline: saveState.networkStatus === 'online',
    canSave: !saveState.isSaving && saveState.hasChanges && saveState.networkStatus === 'online'
  };
};

// Helper function to format time ago
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  }
}
