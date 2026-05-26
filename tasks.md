# App Development Backlog - Mobile Refinements

## Phase 1: Layout, UI fixes & Navigation

### Task 1: Game Details Page UI & Lineup Management
- [-] **Task 1.1: Fix Header Spacing.** Update the game details page header layout, introducing safe area insets or top padding to push the title down so it doesn't overlap with the device status bar (battery/time indicators).
- [-] **Task 1.2: Lineup Teams Display.** Implement the team/group division display (`JoinUp` team splits) on the game details page, mirroring the web version's layout and logic.
- [-] **Task 1.3: Edit Teams Screen Positioning & Save.** Adjust the team editing screen layout to sit lower on the screen (add top padding/safe area). Ensure the "Save Changes" functionality for team configurations is fully wired and functional.
*Git branch: `feature/mobile-game-details-layout`*

### Task 2: Search Page - Active Games Filter
- [PR Created - feature/mobile-filter-past-games] **Task 2.1: Filter out past games.** Update the game search query logic to filter out and hide games whose end-times or dates have already passed, displaying only upcoming matches.
*Git branch: `feature/mobile-filter-past-games`*

### Task 3: Home Page - Series Cards with Images & Indicators
- [-] **Task 3.1: Add images to Series cards.** Update the series cards/items on the main dashboard to display cover images, matching the behavior of single game cards.
- [-] **Task 3.2: Add "Series" badge indicator.** Implement a distinct visual badge or label (taking inspiration from the web platform) to clearly differentiate a multiple-match "Series" card from a single "Game" card.
*Git branch: `feature/mobile-home-series-ui`*

### Task 4: Game Details Utility Actions (Share, Navigate, Calendar)
- [PR Created - feature/mobile-game-details-actions] **Task 4.1: Add Share, Navigate, and Calendar buttons.** Introduce interactive buttons/icons on the game details screen for native sharing, location navigation (linking to maps), and "Add to Calendar" functionality.
*Git branch: `feature/mobile-game-details-actions`*

---

## Phase 2: Advanced Features (Themes, Maps & Notifications)

### Task 5: Mobile Dark Mode Implementation
- [-] **Task 5.1: Dark Mode support.** Add global dark theme configurations matching the application's Cyber League / Electric Sport design palette, ensuring proper contrast across all text and background components.
*Git branch: `feature/mobile-dark-mode`*

### Task 6: Map Integrations (Game Details & Location Creation)
- [x] **Task 6.1: Static/Interactive map on details page.** Embed a map view on the game details page rendering a pin at the specific game coordinates/address.
- [PR Created - feature/task-6.2] **Task 6.2: Custom location pin during game creation.** Align with the web platform to allow users to drop a custom pinpoint on a map during game creation to define a new location (instead of selecting an existing city field).
*Git branch: `feature/mobile-maps-integration`*

### Task 7: Map Search View with Filters
- [PR Created - feature/mobile-map-search-view] **Task 7.1: Search map view.** Build or integrate a map view within the search tab displaying the user's current location surrounded by active game pins.
- [PR Created - feature/mobile-map-search-view] **Task 7.2: Map pin reactive filtering.** Connect the existing search filters (date, sports type, etc.) to dynamically filter and re-render the pins visible on the map.
*Git branch: `feature/mobile-map-search-view`*

### Task 8: Native Push Notifications Sync
- [PR Created - feature/mobile-native-push-notifications] **Task 8.1: Connect in-app events to Native Notifications.** Request device notification permissions and bridge the app's existing real-time notification events to trigger system-level native push notifications on the user's phone.
*Git branch: `feature/mobile-native-push-notifications`*

## Phase 3: Localization, Performance & Map Customization

### Task 9: Series Details Page Layout & Localization
- [PR Created - feature/mobile-series-details-localization] **Task 9.1: Fix Layout Spacing.** Adjust the series details screen layout to reduce overall height and top spacing, ensuring a more compact and mobile-friendly view.
- [PR Created - feature/mobile-series-details-localization] **Task 9.2: Align Series Data with Web.** Update the series screen to fetch and display all metadata available on the web version (such as venue location, recurring schedule details, etc.), replacing the current edit-only state.
- [PR Created - feature/mobile-series-details-localization] **Task 9.3: Multilingual Support & Badges.** Implement full i18n/localization (Hebrew and English) for the series details text. Ensure the "Series" badge indicator on the home page dashboard dynamically adapts its text/layout based on the user's selected language.
*Git branch: `feature/mobile-series-details-localization`*

### Task 10: Notifications Screen Optimization
- [ ] **Task 10.1: Fix Layout Height.** Adjust the notification page design and layout constraints to fix the excessive height issue.
- [ ] **Task 10.2: Fix Infinite Refresh Bug.** Audit the useEffect dependencies or state management lifecycle on the notifications page to prevent the screen from constantly re-rendering/refreshing.
*Git branch: `feature/mobile-notifications-performance-fix`*

### Task 11: Advanced Search Map Customization & Logic
- [ ] **Task 11.1: Sport-Specific Map Markers.** Replace the default red location pins on the search map with dynamic custom markers or icons based on the game's sport category (e.g., Football, Basketball, Tennis).
- [ ] **Task 11.2: Current Location Pin.** Check for device location permissions, and if granted, render a distinct "Current User Location" marker/blue dot on the map.
- [ ] **Task 11.3: Map Camera Camera Focus Logic.** Implement reactive camera positioning for the map: 
  - If the user filters/searches for a specific city, center and focus the map view on that city's coordinates.
  - If "All Cities" or no specific city is selected, center and focus the map directly on the user's current coordinates.
*Git branch: `feature/mobile-search-map-customization`*