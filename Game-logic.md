Game Logic – Leg-Only System with Event-Driven Save & Tournament Tracking

1. Match Structure
Matches consist of legs only (e.g., first to 3 legs)
Game state is saved every 30 seconds and after key events: bust, turn, override

2. Leg Flow
Players start at a fixed score (501)
Alternate turns with up to 3 darts per turn
To win a leg, a player must reach exactly 0, finishing on a double
Bust resets score to start of that turn
Next leg begins unless match is over

Starter Rotation:
First leg starter is decided by "throw for bull"
Players alternate who starts each leg regardless of leg outcome

3. Turn Handling
Up to 3 darts per player
Score validated against current total
Track turn history including busts and successful outs
Calculate scores per dart and per turn

4. Persistent Game State
Match-level: id, players, legs to win, current leg, start time
Player-level: id, name, current score, darts thrown, bust count, checkout attempts, legs won
Leg-level: round-by-round data, player starter info

5. Stats to Track
3-Dart Avg = (Points Scored / Darts Thrown) * 3
Checkout % = (Successful checkouts / valid attempts under 170 that required a double)
High Checkout = highest checkout achieved
Darts per Leg = average number of darts per leg won

6. Checkout Suggestions
When a player’s score is under 170 and a double-out is possible, the system should display suggested finish combinations.
These suggestions should prioritize 1-dart or 2-dart finishes when possible, and always end on a double.

Examples:
170 = T20, T20, Bull
121 = T20, 11, D25
80 = T20, D10
40 = D20
32 = D16
2 = D1
Suggestions should update dynamically based on remaining score and number of darts left in the turn.

7. Round Handling
A round = one full cycle of turns (each player throws once)
Rounds used for overlays, summaries, pacing

8. Pre-Game: Warmup + Throw for Bull
Each player throws 9 darts (3 rounds) for warmup — not recorded in stats, then
Each throws 1 dart for bull — closest to (0,0) wins
Outside board = no score
If tied, players re-throw until winner is decided

Distance Calculation
Create a utility function that receives a dart's board coordinates and returns the distance from the bull (0,0).
Input: coordinates: [number, number]
Output: a tuple: [number, string], e.g. [10, '10 mm']
The function should:
Use the Euclidean distance formula: Math.sqrt(x^2 + y^2)
Round to nearest integer
Return both numeric value and string label
Be used in logic that determines the closest throw to bull




Split into modules:
- matchManager.ts: drives leg state, tracks turns
- statsTracker.ts: calculates and stores averages
- validator.ts: handles busts and double-out rules
