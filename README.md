# Biscuit Bake-Off

A live class game: everyone races through six baking stations at the same time, trying to make the perfect buttermilk biscuit.

- **Students play at:** https://ostromaj.github.io/biscuitmaker/
- **Teacher screen:** https://ostromaj.github.io/biscuitmaker/host.html

## Running a round

1. Open the teacher screen on the projector and press **Open a kitchen**. The first game of the day can take up to a minute while the free server wakes up, so open it a couple of minutes before class.
2. Students go to the student link, type the 4-digit room code, a name, and pick a hat. (Or press **Copy join link** and paste it into Classroom; the code fills in for them.)
3. Press **Start baking**. Everyone gets the same dough and the same oven, so it's fair.
4. Watch the live board. When everyone's done (or you're out of time), press **Ring the bell** for the podium and station stars.
5. **Bake another round** keeps the same room and code. Each student's best score of the day is remembered.

Click the × next to a name in the lobby to remove it. **Close kitchen** ends the room.

## The six stations

| Station | What you do | What it changes on your biscuit |
| --- | --- | --- |
| Measure the flour | Hold to pour, let go at the line (flour keeps falling a moment) | Rise and tenderness |
| Cut in the butter | Tap cubes to chop them to pea size before they melt | Rise |
| Stir in the buttermilk | Tap when the spoon is in the green zone, 5 times | Tenderness (cracks) |
| Fold the layers | Match the arrows fast | Flaky layers and rise |
| Cut the biscuits | Stamp the moving cutter on each circle | Roundness |
| Bake | Pull them out when they match the golden goal | Color |

Each station scores 0–100, so a round is out of 600. **570+ is The Perfect Biscuit.**

Students can also press **Practice solo** on the join screen to play without a room.

## How it's built

- `docs/` is the game itself (plain HTML, CSS, JS, no build step), served by GitHub Pages.
- `server/` is a small Node server with no dependencies that runs the live rooms over WebSockets. It's hosted on Render's free plan at https://biscuitmaker.onrender.com and also serves the game, so that URL works as a backup if GitHub Pages is ever blocked.
- Rooms live in memory. They're cleared after 3 quiet hours, or if the server restarts.

Run it locally: `npm start`, then open http://localhost:8080 and http://localhost:8080/host.html.
