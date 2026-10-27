# Security Specification — Tận Thế Kỷ Nguyên 3D

## 1. Data Invariants

1. **Verified Identity Invariant**: Every read and write operation across `/accounts/{userId}`, `/characters/{characterId}`, and `/assetOverrides/{overrideId}` requires an authenticated user with `request.auth != null` and `request.auth.token.email_verified == true`.
2. **Master Gate & Relational Existence**: Neither a `Character` nor an `AssetOverride` can be created, read, updated, or deleted unless the parent `/accounts/$(request.auth.uid)` document exists and has `status == 'active'`.
3. **Strict Ownership Isolation**: Users can only read (`get`, `list`) or mutate documents where `ownerId == request.auth.uid` (and for `/accounts/{userId}`, `userId == request.auth.uid`). Blanket `allow list: if isSignedIn()` is strictly prohibited.
4. **Zero Shadow Fields (Strict Key Allowlist)**: Every `create` and `update` must pass `isValid[Entity](incoming())` enforcing `hasAll` and `hasOnly` on document keys, plus explicit `affectedKeys().hasOnly(...)` action branches on updates.
5. **Terminal State Locking**: Once an `Account` (`status == 'archived'`), `Character` (`status == 'deleted'`), or `AssetOverride` (`status == 'archived'`) enters a terminal status, no subsequent updates are permitted.
6. **Temporal & Identity Immutability**: `createdAt` and `ownerId` (plus `classId` on `Character` and `slotKey` on `AssetOverride`) are immutable after creation. `createdAt` on create and `updatedAt` on create/update must strictly equal `request.time`.
7. **Volumetric & Regex Bounds**: Path IDs must match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars). Every string enforces explicit `.size()` bounds and arrays (`skillLevels`, `inventoryIds`) enforce strict `.size()` caps (`== 6` and `<= 40`).

## 2. The "Dirty Dozen" Payloads

1. **Unverified Email Spoof**: Authenticated user with `email_verified: false` creating `/accounts/user_1`:
   `{ "ownerId": "user_1", "gameUsername": "GhostRunner", "serverId": "s1", "status": "active", "createdAt": "<SERVER_TIME>", "updatedAt": "<SERVER_TIME>" }`
2. **Identity Spoofing on Account**: Verified `user_1` writing `/accounts/user_2` or setting `ownerId: "user_2"`:
   `{ "ownerId": "user_2", "gameUsername": "Spoofer", "serverId": "s1", "status": "active", "createdAt": "<SERVER_TIME>", "updatedAt": "<SERVER_TIME>" }`
3. **Shadow Field Injection on Character Create**: Verified `user_1` injecting `"isAdmin": true` into `/characters/char_1`:
   `{ ..., "status": "active", "isAdmin": true }`
4. **Orphaned Character Without Master Account**: Verified `user_no_acc` creating `/characters/char_orphan` before `/accounts/user_no_acc` exists.
5. **Path ID Poisoning**: Creating `/characters/char$bad!id` with non-alphanumeric characters or >128 bytes.
6. **Client Timestamp Forgery**: Creating `/accounts/user_1` with `createdAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
7. **Unbounded Inventory Array DoS**: Updating `/characters/char_1` with 100 items in `inventoryIds` (exceeding max 40).
8. **Value Poisoning on Update**: Updating `level` on `/characters/char_1` to `"999999"` (string) or `99999` (exceeding max 500).
9. **Immutable Field Mutation**: Updating `ownerId` or `classId` or `createdAt` on an existing `/characters/char_1`.
10. **Terminal State Resurrection**: Updating a `Character` whose existing `status == 'deleted'` back to `status: 'active'`.
11. **Cross-Tenant List Scraping**: Verified `user_1` executing an unfiltered collection `list` query on `/characters` without `where('ownerId', '==', 'user_1')`.
12. **Asset Override Protocol/Length Overflow**: Creating `/assetOverrides/ov_1` with a 2000-character `modelUrl` (exceeding `maxLength: 512`).
