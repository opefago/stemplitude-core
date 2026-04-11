# Classroom Realtime Load Test Scenarios

## Goals

- Validate Redis fanout throughput and websocket gateway stability.
- Verify replay correctness under reconnect storms.
- Confirm heartbeat timeout and presence cleanup behavior.

## Baseline Scenarios

1. `small-classroom`: 1 instructor + 30 students, 20 minutes.
2. `medium-classroom`: 1 instructor + 120 students, 30 minutes.
3. `peak-hour`: 200 active sessions in parallel, each with 40-60 students.

## Traffic Mix Per Session

- Presence heartbeat: every 20 seconds per participant.
- Chat messages: 0.5 msg/sec average burst to 3 msg/sec.
- Lab switch: 4 changes per hour by instructor.
- Assignment updates: 6 operations per hour by instructor.
- Recognition events: 1 per minute burst windows.

## Failure and Recovery

- Drop websocket for 20% of clients every 2 minutes (forced reconnect).
- Pause one gateway instance to validate Redis cross-node fanout.
- Delay Redis responses (100-300ms) and validate backpressure handling.
- Replay requests from random `last_sequence` cursors to verify convergence.

## Success Criteria

- P95 publish-to-delivery latency < 500ms.
- Reconnect convergence in < 3s median and < 10s P95.
- No stale active presence beyond 60s after disconnect.
- Replay returns strict sequence order without duplicates.
- Gateway error rate < 1% of inbound commands.
