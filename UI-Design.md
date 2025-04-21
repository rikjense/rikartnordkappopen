Scoreboard UI Design

General Layout
Use a responsive grid system to display multiple boards in /overview and a single match UI in /game
The /stream view should be minimal: player names, scores, and leg results

Key Components

Game View (/game)
Player Info Panel
Player name and ID
Legs won
Active player indicator (e.g., glow border)
Current score (large, bold)

Dart Throw Display
Show the 3 most recent darts:
Top row: numeric score (e.g., 60, 50, 1)
Bottom row: throw description (e.g., T20, Bull, S1)
Most recent throw should be highlighted

Stats Panel
3-dart average
First 9 darts average
Checkout percentage
Darts per leg

Checkout Suggestions
When player has less than 170 and can checkout on a double, show finish suggestion (e.g., T20, 10, D20)
Update dynamically based on darts remaining in the turn


Admin View (/admin)
Add/remove boards and players
Assign players to matches
Manually switch turns or correct throws
Reset DB button with confirm prompt

Overview Grid (/overview)
Show a faceplate per board with real-time score, players, and active turn

Stream View (/stream)
The stream view provides a clean, live scoreboard layout for embedding into external video productions (e.g., OBS).
It displays a quad view with live data from all 4 boards.
Each board panel must include:
Player names
Legs won
Current score
3-dart average
Checkout percentage
Match data is subscribed via gameUpdate events from the backend.
The layout should support transparency (no solid background) for easy overlay on live video.
Font should be customizable. A custom tournament font will be provided (TTF/WOFF). Load it in _app.tsx or a global layout using @font-face.
The layout should adapt responsively for different resolutions (e.g., 1080p, 720p stream configurations).
The /stream view should not include dart-by-dart display — just real-time summary info per player per board.

Styling
Dark theme with soft highlights (green/red/white)
Use modern fonts (e.g., Inter or Orbitron)
All UI elements have padding, rounded corners, and avoid clutter


Split into:
- `Scoreboard.tsx`
- `DartThrows.tsx`
- `StatsPanel.tsx`
- `AdminPanel.tsx`
- `OverviewGrid.tsx`
- `StreamOverlay.tsx`
