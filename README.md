# RouteRix

> **Quantum-behaved Particle Swarm Optimization (QPSO) Traffic Allocation Simulator for Bhopal Urban Road Networks**

RouteRix is an intelligent urban traffic allocation and simulation platform designed to alleviate vehicular congestion across key arterial corridors in Bhopal, Madhya Pradesh. By shifting from traditional, greedy shortest-path routing (e.g., Dijkstra/A\*) to a System-Optimal Quantum-behaved Particle Swarm Optimization (QPSO) model calibrated with Indian Road Congress (IRC:106-1990) standards, RouteRix demonstrates substantial reductions in cumulative vehicle-hours and peak bottleneck formation.

---

## Table of Contents

- [Overview & The Problem](#overview--the-problem)
- [System Architecture](#system-architecture)
- [The Role of QPSO in Traffic Allocation](#the-role-of-qpso-in-traffic-allocation)
  - [Why Shortest-Path Algorithms Fail (Tragedy of the Commons)](#why-shortest-path-algorithms-fail-tragedy-of-the-commons)
  - [Mathematical Formulation & BPR Impedance](#mathematical-formulation--bpr-impedance)
  - [Quantum-behaved Particle Swarm Optimization Dynamics](#quantum-behaved-particle-swarm-optimization-dynamics)
- [System Workflow](#system-workflow)
- [Key Features](#key-features)
- [Corridors & Road Network Coverage](#corridors--road-network-coverage)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Demo & Evaluation Access](#demo--evaluation-access)
- [License](#license)

---

## Overview & The Problem

In modern vehicular navigation applications (such as Google Maps or standard in-car GPS), routing engines typically assign individual drivers to the path with the shortest instantaneous travel time (User Equilibrium / Dijkstra). When hundreds or thousands of vehicles simultaneously head along primary corridors during peak hours, this greedy behavior triggers:

1. **Severe Bottlenecks**: High Volume-to-Capacity ($V/C > 1.2$) ratios causing gridlock on principal arteries (e.g., VIP Road, Hamidia Road, MP Nagar).
2. **Underutilized Parallel Corridors**: Alternative arterial roads (e.g., MANIT Bypass, Link Road 1 & 3) remain under-capacity ($V/C < 0.5$).
3. **Braess' Paradox & Network Inefficiency**: Everyone trying to take the "shortest" route causes everyone to experience significantly worse delay.

RouteRix simulates and solves this challenge by dynamically computing a **System-Optimal traffic allocation** using QPSO, actively distributing traffic demand across candidate corridor pairs to minimize total network travel time.

---

## System Architecture

RouteRix is engineered as a full-stack Next.js (App Router) application with a high-performance simulation engine, GIS mapping components, and an integrated persistence layer.

```
+-------------------------------------------------------------------------------+
|                                  CLIENT (UI)                                  |
|                                                                               |
|  +--------------------+   +-----------------------+   +--------------------+  |
|  | Interactive Leaflet|   | Network Flow Diagram  |   | Scenario & Demand  |  |
|  | RouteMap & GPS Pin |   | (Dijkstra vs QPSO)    |   | Controls           |  |
|  +--------------------+   +-----------------------+   +--------------------+  |
|           ^                           ^                         |             |
|           |                           |                         |             |
+-----------|---------------------------|-------------------------|-------------+
            |                           |                         | HTTP / JSON
            v                           v                         v
+-------------------------------------------------------------------------------+
|                       NEXT.JS API LAYER (src/app/api)                         |
|                                                                               |
|   /api/simulate      /api/trips          /api/stats         /api/auth/*       |
+-------------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------------+
|                          SIMULATION & BACKEND ENGINE                          |
|                            (src/lib/server/backend.ts)                        |
|                                                                               |
|  +-------------------------+     +-----------------------------------------+  |
|  | Dynamic OSRM Router     |     | BPR Impedance Engine (IRC:106-1990)     |  |
|  | & Bhopal Survey Presets |     | t(V) = t0 * (1 + 0.15*(V/C)^4)          |  |
|  +-------------------------+     +-----------------------------------------+  |
|               |                                       |                       |
|               +-------------------+-------------------+                       |
|                                   v                                           |
|               +---------------------------------------+                       |
|               |  QPSO Traffic Allocation Optimizer    |                       |
|               |  Objective: Min SUM[ V_i * t_i(V_i) ] |                       |
|               +---------------------------------------+                       |
|                                   |                                           |
|                                   v                                           |
|               +---------------------------------------+                       |
|               | In-Memory Session & History Store     |                       |
|               | (Users, Sessions, Trip History)       |                       |
|               +---------------------------------------+                       |
+-------------------------------------------------------------------------------+
```

### Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, standalone deployment)
- **Frontend / UI**: [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/)
- **GIS & Maps**: [Leaflet](https://leafletjs.com/) and [React-Leaflet](https://react-leaflet.js.org/)
- **Routing Engine**: [Project OSRM](http://project-osrm.org/) API with lateral orthogonal detour generation and calibrated Bhopal surveyed geometries
- **Mathematical Modeling**: Bureau of Public Roads (BPR) link performance function & Indian Road Congress (IRC:106-1990) urban road capacity values

---

## The Role of QPSO in Traffic Allocation

### Why Shortest-Path Algorithms Fail (Tragedy of the Commons)

Standard pathfinding algorithms (Dijkstra, Bellman-Ford, A\*) treat network link costs as static or independently uncoupled. When $Q$ vehicles travel between origin $O$ and destination $D$, Dijkstra sends all $Q$ vehicles down Route A because its free-flow time $t_{0, A} < t_{0, B}$.

However, as volume $V_A \to Q$, the actual travel time surges non-linearly due to friction and congestion. Meanwhile, Route B sits practically empty.

### Mathematical Formulation & BPR Impedance

To evaluate real congestion, RouteRix models road delay using the **Bureau of Public Roads (BPR)** function, parameterized according to Indian Road Congress urban standards:

$$t_i(V_i) = t_{0, i} \cdot \left[ 1 + \alpha \cdot \left( \frac{V_i}{C_i} \right)^\beta \right]$$

Where:
- $t_i(V_i)$: Congested travel time on corridor $i$ (minutes)
- $t_{0, i}$: Free-flow travel time (minutes)
- $V_i$: Assigned vehicular demand on corridor $i$ (PCU/h)
- $C_i$: Practical capacity per direction according to IRC:106-1990 Table 2 design service volumes (PCU/h)
- $\alpha = 0.15$, $\beta = 4.0$: Standard BPR congestion exponent parameters

The total network vehicular impedance $Z$ (in vehicle-hours) across candidate routes is:

$$Z = \sum_{i=1}^{K} \frac{V_i \cdot t_i(V_i)}{60}$$

### Quantum-behaved Particle Swarm Optimization Dynamics

Classical Particle Swarm Optimization (PSO) models particles with position and velocity vectors in Newtonian space:

$$v_{id}^{t+1} = w v_{id}^t + c_1 r_1 (p_{id} - x_{id}^t) + c_2 r_2 (g_d - x_{id}^t)$$
$$x_{id}^{t+1} = x_{id}^t + v_{id}^{t+1}$$

In constrained urban road networks, classical PSO easily gets trapped in local minima or experiences velocity explosion when searching high-dimensional allocation spaces.

**RouteRix implements Quantum-behaved PSO (QPSO)**. In QPSO, particles move in quantum space with a delta potential well centered at the local attractor $p_{id}$. According to the wave function $\psi(x)$ and Schrödinger equation:

1. **Mean Best Position (mbest)**:
   $$mbest = \frac{1}{M} \sum_{i=1}^{M} P_i$$
2. **Local Attractor ($p_i$)**:
   $$p_i = \phi \cdot P_i + (1 - \phi) \cdot G$$
   where $\phi \sim U(0, 1)$, $P_i$ is the particle's personal best, and $G$ is the global swarm best.
3. **Quantum Position Update**:
   $$x_{id}^{t+1} = p_{id} \pm \alpha_q \cdot |mbest_d - x_{id}^t| \cdot \ln\left(\frac{1}{u}\right), \quad u \sim U(0, 1)$$

#### Benefits of QPSO in RouteRix:
- **No Velocity Parameter ($v$)**: Eliminates parameter tuning bottlenecks for velocity boundaries.
- **Quantum Tunneling**: Particles can appear anywhere in the search space with non-zero probability, escaping local congestion traps.
- **Rapid Convergence**: Consistently converges within $< 150 \text{ ms}$ on 100 iterations, enabling real-time interactive routing in the browser.

---

## System Workflow

```
[ User Input / GPS Pin / Preset ]
                |
                v
 [ Geocoding & Reverse Geocoding ]
                |
                v
  [ Corridor Resolution Engine ]
   ├── Dynamic OSRM API (primary + lateral detour)
   └── Surveyed Bhopal Presets (offline/fallback)
                |
                v
  [ Traffic Scenario Applied ]
   ├── Light (500 PCU/h)
   ├── Peak (1000 PCU/h)
   ├── Heavy (2000 PCU/h)
   └── Road Closure (1 Corridor Blocked)
                |
                v
  [ Dual Comparative Evaluation ]
   ├── Baseline: Dijkstra Greedy Allocation
   └── RouteRix: QPSO System-Optimal Split
                |
                v
  [ Visual Representation & Outputs ]
   ├── Interactive Leaflet Map (traffic speed & animated flow pulses)
   ├── Network Node Diagram (allocation split & V/C bottlenecks)
   ├── Delta Metrics (Vehicle-Hours Saved, Travel Time Improvement %)
   └── Persistence (User Account, Saved Trips, Historical Trends)
```

1. **Trip Configuration**: The user inputs origin and destination coordinates via location search, interactive map clicking, GPS geolocation, or surveyed Bhopal presets.
2. **Corridor Candidate Generation**: The engine queries OSRM for the primary route. If an alternative route is not returned natively, a waypoint offset perpendicular to the origin-destination vector generates a realistic alternative arterial corridor.
3. **Demand & Scenario Injection**: The user selects a traffic demand level (Light, Peak, Heavy) or simulates an emergency road closure.
4. **Optimization Computation**:
   - Baseline computes Dijkstra allocation ($100\%$ of traffic on the shortest free-flow road).
   - RouteRix executes QPSO to find the allocation split $(x_A, x_B)$ that minimizes network travel time.
5. **Real-time Map & Diagram Update**: Polylines on the Leaflet map update their color-coded congestion tiers (Green $\to$ Amber $\to$ Red) and flow particle velocities, while the network diagram visualizes PCU distribution.
6. **Persistence**: Completed simulations can be saved to the user's history, tracked on the personal stats dashboard, and reopened with a permalink (`/?trip=<id>`).

---

## Key Features

- **Side-by-Side Comparison**: Switch instantly between the Dijkstra baseline and QPSO-optimized allocation to see travel time differences, total vehicle-hours, and bottleneck counts.
- **Volume-to-Capacity ($V/C$) Gauges**: Explicit indicators marking whether a road is `Smooth (<0.75x)`, `Moderate (0.75x-1.0x)`, `Bottleneck (1.0x-1.5x)`, or `Severe bottleneck (>1.5x)`.
- **Road Closure Simulation**: Test network resilience when one corridor is blocked (e.g., VIP Road closed for VIP movement or Chetak Bridge maintenance).
- **Interactive Leaflet Map**:
  - Live animated SVG dashes illustrating traffic velocity.
  - Interactive click-to-route pins for origin and destination.
  - User geolocation tracking (`navigator.geolocation`).
  - Dark mode and high-contrast styling.
- **Analytics & History**:
  - Total simulations executed.
  - Total cumulative vehicle-hours saved.
  - Daily run frequency charts and scenario breakdowns.
- **Fast-Track Judge / Evaluation Access**: Pre-configured demo login for rapid testing without registration hurdles.

---

## Corridors & Road Network Coverage

RouteRix includes calibrated geometries and IRC design capacities for major arterial routes across Bhopal:

| Corridor Name | Route Via | Length | IRC:106 Capacity |
|---|---|---|---|
| **VIP Road Corridor** | Lalghati $\to$ VIP Road $\to$ Kamla Park $\to$ MP Nagar | 11.1 km | 450 PCU/h (Constrained 2-lane) |
| **MANIT Bypass** | Lalghati $\to$ Depot Chauraha $\to$ MANIT $\to$ MP Nagar | 14.3 km | 900 PCU/h (Divided 4-lane) |
| **Chetak Bridge** | MP Nagar $\to$ Chetak Bridge $\to$ Bhopal Junction | 8.8 km | 600 PCU/h (Bridge bottleneck) |
| **Hamidia Road** | MP Nagar $\to$ Board Office $\to$ Hamidia Road $\to$ Station | 8.2 km | 950 PCU/h (Commercial corridor) |
| **Link Road 3** | Rani Kamlapati $\to$ 10 No. Market $\to$ New Market | 5.9 km | 550 PCU/h (Residential arterial) |
| **Link Road 1** | Rani Kamlapati $\to$ Board Office $\to$ New Market | 6.7 km | 850 PCU/h (Primary 6-lane) |
| **Hoshangabad Road** | VIP Road $\to$ Habibganj $\to$ AIIMS Bhopal | 15.1 km | 1,100 PCU/h (High-capacity artery) |

---

## Project Structure

```
routerix/
├── public/                 # Static vector assets, logos, and favicons
├── src/
│   ├── app/
│   │   ├── account/        # User analytics, simulation history & profile
│   │   ├── api/
│   │   │   └── [...path]/  # Next.js API catch-all (auth, trips, simulation)
│   │   ├── login/          # Authentication & 1-click evaluation access
│   │   ├── reset-password/ # Password recovery token flow
│   │   ├── globals.css     # Tailwind v4 styles, map styling & animations
│   │   ├── layout.tsx      # Root layout, theme scripts, and font loading
│   │   └── page.tsx        # Main RouteRix simulation cockpit & dashboard
│   ├── components/
│   │   ├── AppHeader.tsx   # Top navigation bar, auth state & theme toggle
│   │   ├── AuthShell.tsx   # Auth container and input field components
│   │   ├── NetworkDiagram.tsx # Traffic allocation comparison diagram
│   │   ├── ResetForm.tsx   # Password reset form
│   │   ├── RouteMap.tsx    # Leaflet interactive map with custom flow layers
│   │   └── RouteRixLogo.tsx# Vector branding component
│   └── lib/
│       ├── api.ts          # Client-side API client, types & geocoding utils
│       └── server/
│           ├── backend.ts  # Simulation engine, QPSO, BPR formulas & in-memory DB
│           └── roadCorridors.ts # Pre-calibrated Bhopal corridor geometries
├── metadata.json           # Application metadata & permissions
├── next.config.ts          # Next.js build configuration (standalone mode)
└── package.json            # Dependencies and npm scripts
```

## Demo & Evaluation Access

RouteRix includes a pre-seeded evaluator account loaded with historical simulation data and corridor statistics:

- **Email**: `demo@routerix.in`
- **Password**: `password123`

You can use the **"Quick 1-Click Sign-In as Judge"** button directly on the `/login` page for instantaneous access.

---

## License

This project is open-source under the MIT License. Developed for research and simulation of urban intelligent transportation systems (ITS) in Bhopal, MP.
