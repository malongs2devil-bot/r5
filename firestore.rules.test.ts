/**
 * Firestore Security Rules Specification Tests ("Dirty Dozen" Verification)
 * Validates that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface SimulatedAuth {
  uid: string;
  email_verified: boolean;
}

export interface DirtyPayloadCase {
  id: number;
  name: string;
  auth: SimulatedAuth | null;
  operation: 'create' | 'update' | 'get' | 'list';
  path: string;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyPayloadCase[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof on Account Create',
    auth: { uid: 'user_1', email_verified: false },
    operation: 'create',
    path: '/accounts/user_1',
    payload: { ownerId: 'user_1', gameUsername: 'GhostRunner', serverId: 's1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on Account Owner',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'create',
    path: '/accounts/user_2',
    payload: { ownerId: 'user_2', gameUsername: 'Spoofer', serverId: 's1', status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection (isAdmin) on Character',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'create',
    path: '/characters/char_1',
    payload: { ownerId: 'user_1', name: 'Hero', classId: 'esper', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Orphaned Character Without Active Account',
    auth: { uid: 'user_no_account', email_verified: true },
    operation: 'create',
    path: '/characters/char_orphan',
    payload: { ownerId: 'user_no_account', name: 'Orphan', classId: 'vanguard' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Path ID Poisoning with Illegal Characters',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'create',
    path: '/characters/char$illegal!id',
    payload: { ownerId: 'user_1', name: 'BadId', classId: 'evolver' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery on Account Create',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'create',
    path: '/accounts/user_1',
    payload: { ownerId: 'user_1', gameUsername: 'TimeForger', serverId: 's1', status: 'active', createdAt: '1999-01-01' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unbounded Inventory Array (>40 items)',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'update',
    path: '/characters/char_1',
    payload: { inventoryIds: Array.from({ length: 45 }, (_, i) => `item_${i}`) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Value Poisoning on Level (>500)',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'update',
    path: '/characters/char_1',
    payload: { level: 99999 },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable Field Mutation (classId)',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'update',
    path: '/characters/char_1',
    payload: { classId: 'vanguard' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Terminal State Resurrection (deleted -> active)',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'update',
    path: '/characters/char_deleted',
    payload: { status: 'active' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Cross-Tenant Unfiltered List Query on Characters',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'list',
    path: '/characters',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Asset Override URL Overflow (>512 chars)',
    auth: { uid: 'user_1', email_verified: true },
    operation: 'create',
    path: '/assetOverrides/ov_1',
    payload: { ownerId: 'user_1', slotKey: 'class_esper', modelUrl: 'https://example.com/' + 'a'.repeat(600) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
