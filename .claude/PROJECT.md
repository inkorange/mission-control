# Mission Control: Rocket Engineering Challenge

The core loop would be: you're given a mission brief (payload weight, target orbit or destination, budget) and you have to design, build, and launch a rocket that completes the mission. Score is based on efficiency, cost, and accuracy.

## How to Play and Score

Progression system — Start with simple low-Earth orbit missions and unlock harder challenges: geostationary satellite deployment, lunar transfer, Mars injection, even outer solar system flybys. Each tier introduces new engine types, fuel options, and staging strategies as you prove competency.

The builder — A drag-and-drop rocket assembly interface where you stack stages, select engines (solid, liquid, ion, etc.), set fuel loads, and add fairings/payload adapters. Each component has realistic mass, thrust, and cost stats. Over-engineer it and you blow the budget. Under-engineer it and you don't reach orbit.

The launch — A real-time 2D or 3D flight visualization where you trigger stage separations, gravity turns, and burns manually (or set them on a timeline). You'd see your actual trajectory vs. the optimal one, with live readouts on altitude, velocity, delta-v remaining, and apoapsis/periapsis.

Scoring & challenges — Award stars based on fuel efficiency, cost under budget, and orbital accuracy. Add bonus challenges like "reach orbit with only solid boosters" or "deliver payload to the Moon for under $50M." A leaderboard using your Supabase stack could let users compete on efficiency.

The educational hook — After each mission, show a debrief screen explaining why their design worked or failed: the Tsiolkovsky rocket equation, gravity losses, TWR thresholds, etc. Players learn orbital mechanics by failing and iterating, not by reading.

This would pair perfectly with your solar system sim too — successful missions could unlock destinations you've already modeled. Want to start scoping out the tech architecture or the mission progression tree?

## Technologies

Next.js
ReactJS
Deploy on Vercel
Three.js

similar technologies to my project in https://github.com/inkorange/solar

