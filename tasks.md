# App Development Backlog

## Phase 1: Mobile Refinements (Align with Web)

### Task 1: Profile Page Data & Layout Alignment
- [PR Created] **Task 1.1: Identify and fetch missing data.** Update the mobile profile view/component to fetch and expose all data fields currently available in the web version (e.g., user stats, history, linked accounts).
- [PR Created] **Task 1.2: UI and Layout design.** Adapt the layout for mobile screen sizes, ensuring all information is clearly displayed with responsive spacing, and mark completed.
*Git branch: `feature/mobile-profile-alignment`* 

### Task 2: Home Page - "My Games" & "My Series"
- [PR Created - https://github.com/yairklo/JoinUpApp/pull/new/feature/mobile-home-games-list] **Task 2.1: Add "My Games" & "My Series" section.** Update the mobile home page dashboard to render the user's active games and registered series, mirroring the web implementation layout.
*Git branch: `feature/mobile-home-games-list`*

### Task 3: Chat Header & Navigation Refactor
- [PR Created - https://github.com/yairklo/JoinUpApp/pull/new/feature/mobile-chat-header-navigation] **Task 3.1: Chat view header.** Add a top row/header to individual chat screens displaying the participant's name (or game title for game chats), avatar, and online/typing indicators.
- [PR Created - https://github.com/yairklo/JoinUpApp/pull/new/feature/mobile-chat-header-navigation] **Task 3.2: Add back button navigation.** Implement a back button in the chat header that correctly navigates the user back to the main chats list view.
*Git branch: `feature/mobile-chat-header-navigation`*

## Phase 2: Web Refinements

### Task 4: Web Chat Interaction Update
- [-] **Task 4.1: Game chat floating widget.** Modify the web chat list behavior. Clicking a game chat should toggle/open a compact floating chat widget on the screen instead of executing a hard redirect to the dedicated game page.
*Git branch: `feature/web-floating-game-chat`*