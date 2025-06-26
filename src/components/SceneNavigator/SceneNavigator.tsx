import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Search, X, AlertCircle, CheckCircle } from 'lucide-react';
import SceneCard from './SceneCard';
import { Scene, useScenes } from '../../hooks/useScenes';

interface SceneNavigatorProps {
  projectId: string;
  screenplayId: string;
  activeSceneId: string | null;
  onSelectScene: (sceneId: string) => void;
}

const SceneNavigator: React.FC<SceneNavigatorProps> = ({
  projectId,
  screenplayId,
  activeSceneId,
  onSelectScene,
}) => {
  const { scenes, loading, error, updateScene, deleteScene, reorderScenes } = useScenes(projectId, screenplayId);
  const [searchQuery, setSearchQuery] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const [reorderSuccess, setReorderSuccess] = useState(false);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source } = result;
    
    // If dropped outside the list or no movement
    if (!destination || (destination.index === source.index)) {
      return;
    }

    // Don't allow reordering when search is active
    if (searchQuery.trim()) {
      setReorderError('Cannot reorder scenes while search is active. Clear search first.');
      setTimeout(() => setReorderError(null), 3000);
      return;
    }
    
    setIsReordering(true);
    setReorderError(null);
    setReorderSuccess(false);
    
    try {
      // Create a new array of scenes based on the full scenes list (not filtered)
      const reorderedScenes = Array.from(scenes);
      const [removed] = reorderedScenes.splice(source.index, 1);
      reorderedScenes.splice(destination.index, 0, removed);
      
      // Update the order in Firestore
      await reorderScenes(reorderedScenes);
      
      // Show success feedback
      setReorderSuccess(true);
      setTimeout(() => setReorderSuccess(false), 2000);
      
      // Scroll the moved scene into view in the editor
      onSelectScene(removed.id);
    } catch (err) {
      console.error('Error reordering scenes:', err);
      setReorderError('Failed to reorder scenes. Please try again.');
      setTimeout(() => setReorderError(null), 3000);
    } finally {
      setIsReordering(false);
    }
  };

  const handleEditScene = (scene: Scene) => {
    // Simple prompt for editing - in a real app, this would be a modal
    const newHeading = prompt('Edit scene heading:', scene.scene_heading || scene.title);
    if (newHeading && (newHeading !== scene.scene_heading && newHeading !== scene.title)) {
      updateScene(scene.id, { scene_heading: newHeading });
    }
  };

  const filteredScenes = scenes.filter(scene => {
    const sceneHeading = scene.scene_heading || scene.title || '';
    return sceneHeading.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="p-4 h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#E86F2C] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-500 dark:text-red-400">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" size={16} />
            <input
              type="text"
              placeholder="Search scenes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 border-none rounded-lg focus:ring-2 focus:ring-[#E86F2C] focus:bg-white dark:focus:bg-gray-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Search active warning */}
        {searchQuery.trim() && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <div className="flex items-center text-yellow-800 dark:text-yellow-200">
              <AlertCircle size={16} className="mr-2" />
              <span className="text-sm">Drag-and-drop is disabled while searching. Clear search to reorder scenes.</span>
            </div>
          </div>
        )}

        {filteredScenes.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {searchQuery ? 'No scenes match your search' : 'No scenes yet.'}
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="scenes" isDropDisabled={!!searchQuery.trim() || isReordering}>
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-2"
                >
                  {filteredScenes.map((scene, filteredIndex) => {
                    // Find the actual index in the full scenes list for proper scene numbering
                    const actualIndex = scenes.findIndex(s => s.id === scene.id);
                    
                    return (
                      <Draggable 
                        key={scene.id} 
                        draggableId={scene.id} 
                        index={actualIndex}
                        isDragDisabled={!!searchQuery.trim() || isReordering}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                          >
                            <SceneCard
                              scene={scene}
                              isActive={scene.id === activeSceneId}
                              onSelect={onSelectScene}
                              onEdit={handleEditScene}
                              onDelete={deleteScene}
                              index={actualIndex}
                              isDragging={snapshot.isDragging}
                              dragHandleProps={provided.dragHandleProps}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      {/* Feedback notifications */}
      {reorderSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center z-50">
          <CheckCircle size={16} className="mr-2" />
          Scenes reordered successfully
        </div>
      )}

      {reorderError && (
        <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center z-50">
          <AlertCircle size={16} className="mr-2" />
          {reorderError}
        </div>
      )}

      {isReordering && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center z-50">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
          Reordering scenes...
        </div>
      )}
    </div>
  );
};

export default SceneNavigator;
