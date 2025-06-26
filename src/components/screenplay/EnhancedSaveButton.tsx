import React from 'react';
import { Save, Wifi, WifiOff, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import type { SaveStatus, EnhancedSaveState } from '../../hooks/useEnhancedScreenplaySave';

interface EnhancedSaveButtonProps {
  saveState: EnhancedSaveState;
  onSave: () => void;
  getStatusMessage: () => string;
  toggleAutoSave?: () => void;
  clearError?: () => void;
  className?: string;
  showTooltip?: boolean;
}

const EnhancedSaveButton: React.FC<EnhancedSaveButtonProps> = ({
  saveState,
  onSave,
  getStatusMessage,
  toggleAutoSave,
  clearError,
  className = '',
  showTooltip = true
}) => {
  // Get status-specific styling and icons
  const getStatusDisplay = () => {
    switch (saveState.status) {
      case 'saved':
        return {
          text: saveState.lastSaved ? `Saved ${formatTimeAgo(saveState.lastSaved)}` : 'Saved',
          color: 'bg-green-500 hover:bg-green-600',
          textColor: 'text-white',
          icon: CheckCircle,
          pulse: false,
          disabled: true
        };
      case 'saving':
        return {
          text: 'Saving...',
          color: 'bg-blue-500',
          textColor: 'text-white',
          icon: Loader2,
          pulse: false,
          disabled: true,
          spin: true
        };
      case 'auto-saving':
        return {
          text: 'Auto-saving...',
          color: 'bg-blue-400',
          textColor: 'text-white',
          icon: Loader2,
          pulse: false,
          disabled: true,
          spin: true
        };
      case 'pending':
        return {
          text: saveState.syncQueue > 1 ? `${saveState.syncQueue} changes` : 'Changes pending',
          color: 'bg-gradient-to-r from-[#2563eb] via-[#9333ea] to-[#db2777] hover:opacity-90',
          textColor: 'text-white',
          icon: Save,
          pulse: true,
          disabled: false
        };
      case 'queued':
        return {
          text: `${saveState.syncQueue} queued`,
          color: 'bg-orange-500 hover:bg-orange-600',
          textColor: 'text-white',
          icon: Clock,
          pulse: true,
          disabled: false
        };
      case 'syncing':
        return {
          text: 'Syncing...',
          color: 'bg-purple-500',
          textColor: 'text-white',
          icon: Loader2,
          pulse: false,
          disabled: true,
          spin: true
        };
      case 'conflict':
        return {
          text: saveState.conflictCount > 1 ? `${saveState.conflictCount} conflicts` : 'Conflict',
          color: 'bg-yellow-500 hover:bg-yellow-600',
          textColor: 'text-white',
          icon: AlertTriangle,
          pulse: true,
          disabled: false
        };
      case 'error':
        return {
          text: 'Save error',
          color: 'bg-red-500 hover:bg-red-600',
          textColor: 'text-white',
          icon: AlertTriangle,
          pulse: true,
          disabled: false
        };
      case 'offline':
        return {
          text: 'Offline',
          color: 'bg-gray-500',
          textColor: 'text-white',
          icon: WifiOff,
          pulse: false,
          disabled: true
        };
      default:
        return {
          text: 'Unknown',
          color: 'bg-gray-400',
          textColor: 'text-white',
          icon: Save,
          pulse: false,
          disabled: true
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const IconComponent = statusDisplay.icon;

  // Handle button click
  const handleClick = () => {
    if (saveState.status === 'error' && clearError) {
      clearError();
    } else if (!statusDisplay.disabled) {
      onSave();
    }
  };

  // For use in the ScreenplayNavigator
  const isNavigatorButton = className === '';
  
  if (isNavigatorButton) {
    return (
      <div className="relative group">
        <button
          onClick={handleClick}
          disabled={statusDisplay.disabled && saveState.status !== 'error'}
          className={`px-4 py-2 rounded-lg transition-all duration-200 flex items-center relative ${statusDisplay.color} ${statusDisplay.textColor} ${
            statusDisplay.disabled && saveState.status !== 'error' ? 'opacity-50 cursor-not-allowed' : ''
          } ${statusDisplay.pulse ? 'shadow-lg' : ''} ${className}`}
        >
          <IconComponent 
            size={18} 
            className={`mr-2 ${statusDisplay.spin ? 'animate-spin' : ''}`} 
          />
          <span>{statusDisplay.text}</span>
          
          {/* Network status indicator */}
          <div className="absolute -top-1 -right-1 flex items-center">
            {saveState.networkStatus === 'online' ? (
              <Wifi size={12} className="text-green-400" />
            ) : (
              <WifiOff size={12} className="text-red-400" />
            )}
          </div>
          
          {/* Pulse indicator for pending changes */}
          {statusDisplay.pulse && (
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          )}
        </button>
        
        {/* Enhanced tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
            <div className="text-center">
              <div className="font-medium">{getStatusMessage()}</div>
              {saveState.networkStatus === 'offline' && (
                <div className="text-xs text-gray-300 mt-1">Changes will sync when online</div>
              )}
              {saveState.autoSaveEnabled && saveState.networkStatus === 'online' && (
                <div className="text-xs text-gray-300 mt-1">Auto-save enabled</div>
              )}
              {saveState.status === 'error' && (
                <div className="text-xs text-gray-300 mt-1">Click to retry</div>
              )}
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    );
  }
  
  // For use as a floating button elsewhere
  return (
    <div className="relative group">
      <button
        onClick={handleClick}
        disabled={statusDisplay.disabled && saveState.status !== 'error'}
        className={`fixed bottom-8 right-8 p-4 rounded-full shadow-lg transition-all duration-200 ${statusDisplay.color} ${statusDisplay.textColor} ${
          statusDisplay.disabled && saveState.status !== 'error' ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
      >
        <IconComponent 
          size={24} 
          className={statusDisplay.spin ? 'animate-spin' : ''} 
        />
        
        {/* Network status indicator */}
        <div className="absolute -top-1 -right-1">
          {saveState.networkStatus === 'online' ? (
            <Wifi size={14} className="text-green-400" />
          ) : (
            <WifiOff size={14} className="text-red-400" />
          )}
        </div>
        
        {/* Pulse indicator for pending changes */}
        {statusDisplay.pulse && (
          <div className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full animate-pulse"></div>
        )}
      </button>
      
      {/* Enhanced tooltip for floating button */}
      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          <div className="text-center">
            <div className="font-medium">{getStatusMessage()}</div>
            {saveState.networkStatus === 'offline' && (
              <div className="text-xs text-gray-300 mt-1">Changes will sync when online</div>
            )}
            {saveState.autoSaveEnabled && saveState.networkStatus === 'online' && (
              <div className="text-xs text-gray-300 mt-1">Auto-save enabled</div>
            )}
            {saveState.status === 'error' && (
              <div className="text-xs text-gray-300 mt-1">Click to retry</div>
            )}
          </div>
          <div className="absolute top-full right-4 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

// Helper function to format time ago (duplicated from hook for component independence)
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

export default EnhancedSaveButton;
