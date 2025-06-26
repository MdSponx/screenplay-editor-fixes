import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { BlockComponentProps, CharacterDocument, ElementDocument } from '../types';
import { getBlockStyle, getBlockMargin } from '../utils/styleUtils';
import SceneHeadingSuggestionsImproved from './SceneHeadingSuggestionsImproved';
import TransitionSuggestions from './TransitionSuggestions';
import ShotTypeSuggestions from './ShotTypeSuggestions';
import CharacterSuggestions from './CharacterSuggestions';
import ElementSuggestions from './ElementSuggestions';

interface ExtendedBlockComponentProps extends BlockComponentProps {
  projectCharacters?: CharacterDocument[];
  projectElements?: ElementDocument[];
  projectId?: string;
  screenplayId?: string;
  projectUniqueSceneHeadings?: any[];
  onEnterAction?: () => void;
  isProcessingSuggestion?: boolean;
  setIsProcessingSuggestion?: (processing: boolean) => void;
  isCharacterBlockAfterDialogue?: (blockId: string) => boolean;
  isSceneSelectionActive?: boolean;
}

const BlockComponentImproved: React.FC<ExtendedBlockComponentProps> = ({
  block,
  isDarkMode,
  onContentChange,
  onKeyDown,
  onFocus,
  onClick,
  onMouseDown,
  onDoubleClick,
  isSelected,
  isActive,
  blockRefs,
  projectCharacters = [],
  projectElements = [],
  projectId,
  screenplayId,
  projectUniqueSceneHeadings = [],
  onEnterAction,
  isProcessingSuggestion,
  setIsProcessingSuggestion,
  isCharacterBlockAfterDialogue,
  isSceneSelectionActive = false,
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsPosition, setSuggestionsPosition] = useState<{ x: number; y: number } | null>(null);
  const [suggestionType, setSuggestionType] = useState<'scene' | 'transition' | 'shot' | 'character' | 'element' | null>(null);
  const [currentInput, setCurrentInput] = useState('');
  const [contentElement, setContentElement] = useState<HTMLDivElement | null>(null);
  const [isProcessingSelection, setIsProcessingSelection] = useState(false);
  const ignoreBlurRef = useRef(false);
  const suggestionClosingRef = useRef(false);
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null;

  // Enhanced action block creation after scene heading completion
  const handleEnterActionCreation = useCallback(() => {
    if (onEnterAction) {
      onEnterAction();
    }
  }, [onEnterAction]);

  // Function to check if the current scene heading is new
  const isNewSceneHeading = useCallback(() => {
    if (block.type !== 'scene-heading') return false;
    
    const trimmedInput = block.content.trim();
    if (!trimmedInput) return false;
    
    const inputUpper = trimmedInput.toUpperCase();
    
    // Default scene type suggestions
    const defaultSceneTypes = [
      { label: 'INT. ' },
      { label: 'EXT. ' },
      { label: 'INT./EXT. ' },
      { label: 'EXT./INT. ' },
      { label: 'I/E. ' }
    ];
    
    // Create suggestions array like dropdown does
    const allLabelsUpper = new Set();
    
    // Add default scene types
    defaultSceneTypes.forEach(type => {
      allLabelsUpper.add(type.label.toUpperCase().trim());
    });
    
    // Add existing scene headings
    projectUniqueSceneHeadings.forEach(heading => {
      allLabelsUpper.add(heading.text.toUpperCase().trim());
    });
    
    // Check exact match
    const exactMatch = allLabelsUpper.has(inputUpper);
    
    // Check valid prefix
    const hasValidPrefix = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)/i.test(trimmedInput);
    
    // Check if it's only a prefix in defaults
    const isOnlyPrefixInDefaults = defaultSceneTypes.some(d => d.label.toUpperCase().trim() === inputUpper);
    
    // Show NEW badge if input exists, no exact match, has valid prefix, and not just a default prefix
    const shouldShowNew = trimmedInput && !exactMatch && hasValidPrefix && !isOnlyPrefixInDefaults;
    
    // Show when suggestions are active OR when the block is active
    return shouldShowNew && (showSuggestions || isActive);
  }, [block.type, block.content, projectUniqueSceneHeadings, showSuggestions, isActive]);

  const updateSuggestionsPosition = useCallback(() => {
    if (!contentElement) return;

    const blockRect = contentElement.getBoundingClientRect();
    
    // Use viewport-relative coordinates
    setSuggestionsPosition({
      x: blockRect.left,
      y: blockRect.bottom
    });
  }, [contentElement]);

  // Enhanced suggestions closing
  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setSuggestionType(null);
    setSuggestionsPosition(null);
    suggestionClosingRef.current = true;
    
    // Reset flag after short delay
    setTimeout(() => {
      suggestionClosingRef.current = false;
    }, 100);
  }, []);

  // Enhanced suggestions management based on block state
  useEffect(() => {
    // Don't show suggestions if scene selection is active
    if (isSceneSelectionActive) {
      setShowSuggestions(false);
      return;
    }
    
    if (isActive && !suggestionClosingRef.current) {
      const content = block.content;
      
      if (block.type === 'scene-heading') {
        updateSuggestionsPosition();
        setSuggestionType('scene');
        setCurrentInput(content);
        setShowSuggestions(true);
      } else if (block.type === 'transition' && !content.trim()) {
        updateSuggestionsPosition();
        setSuggestionType('transition');
        setShowSuggestions(true);
      } else if (block.type === 'shot' && !content.trim()) {
        updateSuggestionsPosition();
        setSuggestionType('shot');
        setShowSuggestions(true);
      } else if (block.type === 'character') {
        // NEW BEHAVIOR: Don't show character suggestions immediately for blocks created after dialogue
        const isAfterDialogue = isCharacterBlockAfterDialogue?.(block.id) ?? false;
        
        if (!isAfterDialogue) {
          // Original behavior for character blocks not created after dialogue
          updateSuggestionsPosition();
          setSuggestionType('character');
          setCurrentInput(content);
          setShowSuggestions(true);
        } else {
          // New behavior: Don't show suggestions immediately for blocks created after dialogue
          updateSuggestionsPosition();
          setSuggestionType('character');
          setCurrentInput(content);
          setShowSuggestions(false); // Don't show immediately
        }
      } else {
        setShowSuggestions(false);
      }
    } else {
      setShowSuggestions(false);
    }
  }, [block.type, block.content, isActive, updateSuggestionsPosition, isCharacterBlockAfterDialogue, isSceneSelectionActive]);

  // Update suggestion position on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (isActive && showSuggestions) {
        updateSuggestionsPosition();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isActive, showSuggestions, updateSuggestionsPosition]);

  const handleFocus = useCallback(() => {
    onFocus(block.id);
    
    // Don't open suggestions if just closed or if scene selection is active
    if (suggestionClosingRef.current || isSceneSelectionActive) return;
    
    if (block.type === 'scene-heading') {
      updateSuggestionsPosition();
      setSuggestionType('scene');
      setCurrentInput(block.content);
      setShowSuggestions(true);
    } else if (block.type === 'transition' && !block.content.trim()) {
      updateSuggestionsPosition();
      setSuggestionType('transition');
      setShowSuggestions(true);
    } else if (block.type === 'shot' && !block.content.trim()) {
      updateSuggestionsPosition();
      setSuggestionType('shot');
      setShowSuggestions(true);
    } else if (block.type === 'character') {
      // NEW BEHAVIOR: Don't show character suggestions immediately for blocks created after dialogue
      const isAfterDialogue = isCharacterBlockAfterDialogue?.(block.id) ?? false;
      
      updateSuggestionsPosition();
      setSuggestionType('character');
      setCurrentInput(block.content);
      
      if (!isAfterDialogue) {
        // Original behavior for character blocks not created after dialogue
        setShowSuggestions(true);
      } else {
        // New behavior: Don't show suggestions immediately for blocks created after dialogue
        setShowSuggestions(false); // Don't show immediately
      }
    }
  }, [onFocus, block.id, block.type, block.content, updateSuggestionsPosition, isCharacterBlockAfterDialogue, isSceneSelectionActive]);

  // Enhanced suggestion selection with processing state to prevent multiple events
  const handleSuggestionSelect = useCallback((value: string) => {
    // Prevent multiple selections if already processing
    if (isProcessingSelection) return;
    
    console.log(`Selected suggestion: "${value}" for block type: ${block.type}`);
    
    // Set processing state immediately (both local and global)
    setIsProcessingSelection(true);
    if (setIsProcessingSuggestion) {
      setIsProcessingSuggestion(true);
    }
    
    // Check if this is a scene heading prefix selection
    const isSceneTypePrefix = block.type === 'scene-heading' && 
                             /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.|I\/E\.)\s?$/i.test(value.trim());
    
    // Update content first
    onContentChange(block.id, value, block.type);
    
    // For prefix-only selections, keep suggestions open and maintain focus
    if (isSceneTypePrefix) {
      setCurrentInput(value);
      
      // Enhanced focus management for prefix selections
      requestAnimationFrame(() => {
        const el = blockRefs.current[block.id];
        if (el) {
          el.focus();
          
          // Place cursor at the end of the text with improved reliability
          const range = document.createRange();
          const selection = window.getSelection();
          
          if (selection) {
            let textNode = el.firstChild;
            
            // Ensure we have a text node
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
              textNode = document.createTextNode(value);
              el.innerHTML = '';
              el.appendChild(textNode);
            }
            
            const textLength = textNode.textContent?.length || 0;
            range.setStart(textNode, textLength);
            range.setEnd(textNode, textLength);
            
            selection.removeAllRanges();
            selection.addRange(range);
          }
        }
        
        // Reset processing state after prefix selection
        setIsProcessingSelection(false);
        if (setIsProcessingSuggestion) {
          setIsProcessingSuggestion(false);
        }
      });
      
      return; // Don't close suggestions
    }
    
    // For complete selections, close suggestions immediately
    closeSuggestions();
    
    // Enhanced focus management for complete selections
    requestAnimationFrame(() => {
      const el = blockRefs.current[block.id];
      if (el) {
        // Update the element content first to ensure it matches the selected value
        el.textContent = value;
        el.focus();
        
        // Set cursor at the end for complete scene headings with improved reliability
        setTimeout(() => {
          const selection = window.getSelection();
          if (selection && el) {
            selection.removeAllRanges();
            const range = document.createRange();
            
            // Ensure we have the correct text content
            if (el.textContent !== value) {
              el.textContent = value;
            }
            
            let textNode = el.firstChild;
            if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
              textNode = document.createTextNode(value);
              el.innerHTML = '';
              el.appendChild(textNode);
            }
            
            const textLength = textNode.textContent?.length || 0;
            range.setStart(textNode, textLength);
            range.setEnd(textNode, textLength);
            selection.addRange(range);
            
            console.log(`Cursor positioned at end of scene heading: "${value}" (length: ${textLength})`);
          }
        }, 10);
      }
      
      // Reset processing state after complete selection
      setIsProcessingSelection(false);
      if (setIsProcessingSuggestion) {
        setIsProcessingSuggestion(false);
      }
    });
  }, [block.id, block.type, onContentChange, blockRefs, closeSuggestions, handleEnterActionCreation, isProcessingSelection, setIsProcessingSuggestion]);

  // Enhanced keyboard handling that properly prevents conflicts with suggestions
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // If processing a selection, block all Enter events
    if (isProcessingSelection && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    
    // CRITICAL: Special handling for transition blocks - ALWAYS allow Enter key to pass through
    // This must come before any other Enter key handling to ensure it works regardless of suggestions
    if (block.type === 'transition' && e.key === 'Enter') {
      // Close any open suggestions first
      if (showSuggestions) {
        closeSuggestions();
      }
      // For transition blocks, always pass Enter to parent handler for scene creation
      onKeyDown(e, block.id);
      return;
    }
    
    // If suggestions are showing and this is a navigation/selection key, prevent parent handling
    // BUT exclude transition blocks from this logic since they're handled above
    if (showSuggestions && ['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key) && block.type !== 'transition') {
      // Stop the event from bubbling to parent components
      e.stopPropagation();
      // Don't call onKeyDown for these keys when suggestions are active
      return;
    }
    
    // For all other keys, pass to parent component
    onKeyDown(e, block.id);
    
    // Update current input for suggestion filtering
    if (showSuggestions) {
      setTimeout(() => {
        const content = e.currentTarget.textContent || '';
        setCurrentInput(content);
        updateSuggestionsPosition();
      }, 0);
    }
  }, [showSuggestions, onKeyDown, block.id, updateSuggestionsPosition, isProcessingSelection, block.type, closeSuggestions]);

  // Enhanced input handling - Fixed to use contentElement ref instead of event target
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const content = contentElement?.textContent || '';
    setCurrentInput(content);
    
    // Don't open suggestions if just closed or if scene selection is active
    if (suggestionClosingRef.current || isSceneSelectionActive) return;
    
    if (block.type === 'scene-heading') {
      updateSuggestionsPosition();
      setSuggestionType('scene');
      setShowSuggestions(true);
    } else if (block.type === 'transition' && !content.trim()) {
      updateSuggestionsPosition();
      setSuggestionType('transition');
      setShowSuggestions(true);
    } else if (block.type === 'shot' && !content.trim()) {
      updateSuggestionsPosition();
      setSuggestionType('shot');
      setShowSuggestions(true);
    } else if (block.type === 'character') {
      // NEW BEHAVIOR: For character blocks created after dialogue, show suggestions when user starts typing
      const isAfterDialogue = isCharacterBlockAfterDialogue?.(block.id) ?? false;
      
      if (isAfterDialogue && content.trim().length > 0) {
        // User started typing in a character block created after dialogue - now show suggestions
        updateSuggestionsPosition();
        setSuggestionType('character');
        setShowSuggestions(true);
      } else if (!isAfterDialogue) {
        // Original behavior for character blocks not created after dialogue
        updateSuggestionsPosition();
        setSuggestionType('character');
        setShowSuggestions(true);
      }
      // If isAfterDialogue and content is empty, don't show suggestions (wait for user to type)
    } else {
      setShowSuggestions(false);
    }
  }, [block.type, block.id, updateSuggestionsPosition, contentElement, isCharacterBlockAfterDialogue, isSceneSelectionActive]);

  // Enhanced blur handling
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (ignoreBlurRef.current) {
      return;
    }
    
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget?.closest('.scene-heading-suggestions-improved, .transition-suggestions, .shot-type-suggestions, .character-suggestions, .element-suggestions')) {
      onContentChange(block.id, e.currentTarget.textContent || '');
      closeSuggestions();
    }
  }, [onContentChange, block.id, closeSuggestions]);

  const handleDoubleClickInternal = useCallback((e: React.MouseEvent) => {
    if (onDoubleClick) {
      onDoubleClick(block.id, e);
    }
  }, [onDoubleClick, block.id]);

  // Render suggestion components using portals
  const renderSuggestions = () => {
    if (!showSuggestions || !suggestionsPosition || !portalRoot) return null;

    const suggestionContent = (
      <>
        {suggestionType === 'scene' && (
          <SceneHeadingSuggestionsImproved
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={closeSuggestions}
            projectId={projectId}
            screenplayId={screenplayId}
            currentInput={currentInput}
            onEnterAction={handleEnterActionCreation}
          />
        )}
        
        {suggestionType === 'transition' && (
          <TransitionSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={closeSuggestions}
          />
        )}
        
        {suggestionType === 'shot' && (
          <ShotTypeSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={closeSuggestions}
          />
        )}
        
        {suggestionType === 'character' && (
          <CharacterSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={closeSuggestions}
            projectCharacters={projectCharacters}
            projectId={projectId}
            currentInput={currentInput}
          />
        )}

        {suggestionType === 'element' && projectElements && (
          <ElementSuggestions
            blockId={block.id}
            onSelect={handleSuggestionSelect}
            position={suggestionsPosition}
            onClose={closeSuggestions}
            projectElements={projectElements}
            currentInput={currentInput}
          />
        )}
      </>
    );

    return createPortal(suggestionContent, portalRoot);
  };

  return (
    <div 
      className={`relative screenplay-block block-container ${getBlockMargin(block.type)} ${
        isSelected ? 'selecting' : ''
      } ${isSelected ? 'multi-selected' : ''}`}
      onClick={(e) => onClick(block.id, e)}
      onMouseDown={(e) => onMouseDown(block.id, e)}
      onDoubleClick={handleDoubleClickInternal}
      data-block-id={block.id}
      data-active={isActive}
      data-selected={isSelected}
      data-block-type={block.type}
    >
      {block.type === 'scene-heading' && (
        <div
          className={`absolute inset-0 ${
            isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'
          } rounded`}
          style={{
            transform: 'translateY(2px)',
            height: '1.75rem',
          }}
        />
      )}
      {block.type === 'scene-heading' && block.number && (
        <div
          className={`absolute -left-8 top-1/2 -translate-y-1/2 text-sm ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {block.number}
        </div>
      )}
      <div
        ref={(el) => {
          if (blockRefs && blockRefs.current) {
            blockRefs.current[block.id] = el;
          }
          setContentElement(el);
        }}
        contentEditable
        suppressContentEditableWarning
        className={`block-editor ${getBlockStyle({ type: block.type, isDarkMode, isSelected })} ${
          isSelected ? (isDarkMode ? 'bg-blue-900/30' : 'bg-blue-100') : ''
        }`}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        data-block-id={block.id}
        style={{
          WebkitUserSelect: 'text',
          MozUserSelect: 'text',
          msUserSelect: 'text',
          userSelect: 'text',
        }}
      >
        {block.content}
      </div>
      {block.type === 'dialogue' && block.number && (
        <div
          className={`absolute -right-8 top-1/2 -translate-y-1/2 text-sm ${
            isDarkMode ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          {block.number}
        </div>
      )}
      
      {/* Enhanced NEW badge for new scene headings */}
      {isNewSceneHeading() && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
          <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full shadow-sm animate-pulse">
            NEW
          </span>
        </div>
      )}
      
      {/* Render suggestions using portals */}
      {renderSuggestions()}
    </div>
  );
};

export default BlockComponentImproved;
