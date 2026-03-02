# Chat Component & Right-Panel UI Specification

## Overview
This document outlines the refactored Chat Interface architecture, focusing on the "File Scope" (right-side panel) widget. The goal is to provide a clean, accessible, and performant UI for managing chat sessions and context files.

## 1. Right-Panel: File Scope Widget (`FileScopeSelector`)

### Purpose
Allows users to select specific documents to serve as context for the AI's responses. This granular control helps improve answer accuracy by limiting the search space.

### Data Source
- **Files**: `files` prop (Array of `FileRow` objects from `Classes.tsx` -> `useChatSession` -> `listFiles` API).
  - `id`: string (Unique identifier)
  - `filename`: string (Display name)
  - `status`: string (Processing status)
- **Selection State**: `selectedIds` prop (Array of strings) managed by `useChatSession` hook.
- **Active PDF State**: `activeFileId` prop (Optional string) to highlight the currently selected PDF context.
- **Actions**:
  - `onToggle`: Function to toggle individual file selection (context inclusion).
  - `onSelectAll`: Function to select all filtered files.
  - `onClear`: Function to deselect all files.
  - `onFileClick`: Function to switch the active PDF context (filters chat sessions).

### UI Structure
1.  **Header**
    -   **Title**: "Context Sources" with a help tooltip explaining its purpose.
    -   **Summary**: "X selected" to give immediate feedback.
2.  **Search/Filter**
    -   **Input**: A text field to filter the file list by name in real-time.
3.  **File List** (Scrollable area)
    -   **Empty State**: "No documents available" or "No files match your search".
    -   **List Item**:
        -   **Toggle Button**: Square checkbox icon to include/exclude file from context.
        -   **Content Area**:
            -   **Name**: Truncated filename with full name on hover.
            -   **Status**: Processing status dot.
            -   **Active Badge**: "ACTIVE" label if this file is the current PDF context.
        -   **Interaction**: 
            -   Click **row** to switch active PDF context (filters sessions).
            -   Click **checkbox** to toggle context inclusion (for AI retrieval).
4.  **Footer**
    -   **Actions**: "Select All" and "Clear" buttons for bulk operations.
    -   **Helper Text**: "Select files for context" to guide the user.

### User Flows
1.  **Switch PDF Context**:
    -   User clicks a file row -> `activeFileId` updates -> Chat sessions list filters to show only chats for this PDF.
2.  **Toggle Context Inclusion**:
    -   User clicks the checkbox icon -> `onToggle` fires -> File is added/removed from retrieval context.
3.  **Filter and Select**:
    -   User types "lecture" in search -> List filters -> User clicks "Select All" -> Only visible "lecture" files are selected.
4.  **Clear Context**:
    -   User clicks "Clear" -> All selections are removed -> Chat context is reset.

### Accessibility (WCAG 2.1 AA)
-   **Contrast**: Text/Background ratio > 4.5:1.
-   **Keyboard**: Full navigation via Tab and Enter/Space.
-   **ARIA**:
    -   `role="region"` for the widget.
    -   `aria-label` for buttons and inputs.
    -   `aria-checked` for file rows.
    -   Focus indicators are visible and distinct.

### Performance
-   **Memoization**: `filteredFiles` calculation is memoized to prevent re-filtering on every render.
-   **Virtualization**: (Future consideration) If file list exceeds 100 items, virtual scrolling can be added.

---

## 2. Left-Panel: Session List (`ChatSessionList`)

### Purpose
Navigates between different chat threads and allows managing session lifecycle (create, rename, delete).

### Data Source
-   **Sessions**: `sessions` prop (Array of `ChatSession` objects).
-   **Active ID**: `activeSessionId` prop.
-   **Context Title**: `contextTitle` prop (Optional string) showing the active PDF name or "Global Chat".

### UI Structure
-   **Header**: "Sessions" title + "New" button + (Optional) Context Badge showing active PDF name.
-   **List**: Scrollable list of sessions.
-   **Item**:
    -   **Title**: Session name (truncated).
    -   **Actions**: Kebab menu (Rename, Clear Messages, Delete) visible on hover/focus.
    -   **Active State**: Highlighted background for current session.

---

## 3. Center-Panel: Conversation (`ChatConversation`)

### Purpose
The main chat interface where users interact with the AI.

### Data Source
-   **Messages**: `messages` prop (Array of `Msg` objects).
-   **Input**: `input` state.

### UI Structure
-   **Header**: "Conversation" title + "Show citations" toggle.
-   **Message List**: Auto-scrolling list of message bubbles.
    -   **User Bubble**: Right-aligned, primary color.
    -   **Assistant Bubble**: Left-aligned, neutral color, supports Markdown and citations.
-   **Input Area**: Textarea (auto-expanding), Send button, Attachment previews.

---

## 4. Component Architecture

```
src/components/chat/
├── ChatInterface.tsx       # Main Layout (Grid: 260px | 1fr | 260px)
├── ChatSessionList.tsx     # Left Panel
├── ChatConversation.tsx    # Center Panel
├── FileScopeSelector.tsx   # Right Panel
└── components/             # Shared atoms (optional)
```

## 5. Integration

The `ChatInterface` component is integrated into `Classes.tsx` as the main view for the "Chat" tab. It receives all necessary state and handlers from the `useChatSession` hook, ensuring a clean separation of concerns between UI and business logic.
