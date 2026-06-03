# geknee — Non-Negotiable Rules

These features must never regress. If a change would degrade any of them, do not ship it — find another path.

1. **Globe with 3D-quality monuments**
   Every unlocked monument on the globe renders with 3D-quality visuals (real Meshy GLB on web, pre-rendered Meshy sprite on iOS). No flat dots, no generic pins. The 3D feel is core to the product.

2. **AI itinerary**
   The AI itinerary generator must remain functional end-to-end: destination → AI-generated plan → editable/saveable trip. This is the primary value loop.

3. **Trip file and group chat saving**
   Trips persist server-side and can be shared via group chat. Both the trip file (full plan, pins, dates) and the group chat thread must survive sign-out/sign-in and be retrievable across devices.
