# Chat Loading & Performance Architecture

## Goals

- **Instant open**: First 10 messages show immediately (no 1–2 s delay).
- **Invisible background preload**: Older messages load in 20-message batches up to 200 total; user does not see them until they scroll up.
- **No UI jump**: No progressive loading, no scroll shift, no visible loader for background batches.
- **Home → Chat**: Navigation is non-blocking; messages come from preload cache when available.
- **Pre-store on Home**: When a new message arrives and user is on Home, it is saved to PouchDB so opening that chat already has it.

---

## Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ HOME SCREEN                                                              │
│ - Conversations list loads → preloadRoomMessages(roomId) for top 5 rooms │
│ - userchats listener: on update → fetchLatestMessageAndSaveToPouchDB()   │
│   (so new messages are in PouchDB before user opens chat)                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ User taps chat
┌─────────────────────────────────────────────────────────────────────────┐
│ openChat(chat)                                                           │
│ - Set currentChat                                                        │
│ - If preload cache has roomId → use it (instant), schedule background   │
│   preload, setup listeners, return (no await)                            │
│ - If in-memory state has messages → emit visible slice, return           │
│ - Else start initialLoad(roomId) (no await), setup listeners, return    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Chat screen mounts
┌─────────────────────────────────────────────────────────────────────────┐
│ CHAT SCREEN (ionViewWillEnter)                                           │
│ - Subscribes to chatService.getMessages()                                │
│ - Receives visible slice (10 messages) → render, scroll to bottom       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│ FIREBASE CHAT SERVICE (per room)                                         │
│                                                                          │
│ _roomPaginationState: { messages[], visibleCount, oldestTs, newestTs }   │
│ - visibleCount: only this many messages (from newest) are emitted       │
│ - messages: full buffer (up to 200); background preload appends here     │
│                                                                          │
│ initialLoad(roomId):                                                     │
│   - Load 10 from PouchDB (or Firebase if empty)                          │
│   - Set state with visibleCount=10, emit getVisibleSlice(roomId)         │
│   - scheduleBackgroundPreload(roomId) → loadOlderMessages(..., {reveal:  │
│       false}) in loop; appends to state.messages, does NOT emit          │
│                                                                          │
│ loadOlderMessages(roomId, { reveal }) (user scroll up):                  │
│   - If buffer has more than visibleCount: visibleCount += 20, emit slice │
│   - Else fetch 20 from PouchDB/Firebase, merge, visibleCount += 20, emit │
│                                                                          │
│ getVisibleSlice(roomId): state.messages sorted, then slice(-visibleCount)│
│ emitVisibleSlice(roomId): emitRoomMessages(roomId, getVisibleSlice(...))  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Implementation Details

1. **visibleCount**  
   Only the last `visibleCount` messages in `state.messages` are sent to the UI. Background preload increases `state.messages` but keeps `visibleCount` at 10, so no extra UI updates.

2. **Preload cache**  
   `preloadRoomMessages(roomId)` loads the latest 10 into `_preloadCache`. When `openChat` runs, if that room is in the cache, state is restored from cache and no PouchDB read is needed for the first paint.

3. **Pre-store on Home**  
   When `userchats/{userId}/{roomId}` is updated (e.g. new message) and `currentChat?.roomId !== roomId`, `fetchLatestMessageAndSaveToPouchDB(roomId)` runs: fetches latest message from Firebase, merges into PouchDB. Opening that chat later gets it from PouchDB or preload.

4. **Non-blocking openChat**  
   `openChat` does not await `initialLoad` when there is no cache/state; it starts `initialLoad` and returns so navigation can happen immediately. The chat screen subscribes to `getMessages()` and shows data as soon as the service emits.

5. **Scroll to bottom**  
   When the first non-empty message set is received in the chat screen, `scrollToBottomInstant()` is scheduled (e.g. after 50 ms) so the view is at the latest messages without flicker.

6. **trackBy**  
   The chat list uses `trackByFlatItem` / `trackByMessageId` so Angular can update the list without full re-renders when the visible slice or buffer changes.

---

## Files Touched

- `firebase-chat.service.ts`: visibleCount, getVisibleSlice, emitVisibleSlice, preload cache, openChatWithConv, fetchLatestMessageAndSaveToPouchDB, loadOlderMessages(reveal), background preload with `reveal: false`.
- `chatting-screen.page.ts`: scroll to bottom on first messages, fallback scroll in ngAfterViewInit.
- `home-screen.page.ts`: preload top 5 rooms when conversations list is set.
- `RoomPaginationState`: added `visibleCount`.
