import type { Server as SocketServer } from 'socket.io';

export type UserSocketMap = Map<string, string>;

export function emitToFamily(
  io: SocketServer,
  _userSockets: UserSocketMap,
  familyId: string,
  event: string,
  data: unknown
): void {
  if (!familyId) return;
  io.to(`family:${familyId}`).emit(event, data);
}

export function emitToUser(
  io: SocketServer,
  userSockets: UserSocketMap,
  userId: string,
  event: string,
  data: unknown
): void {
  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

export function notifyFamily(
  io: SocketServer,
  _userSockets: UserSocketMap,
  familyId: string,
  _excludeUserId: string,
  notification: unknown
): void {
  if (!familyId) return;
  io.to(`family:${familyId}`).emit('notification', notification);
}

interface FinanceUpdate {
  userId: string;
  type: string;
  transaction?: unknown;
  category?: unknown;
  userName?: string;
}

export function emitFinanceUpdate(
  io: SocketServer,
  _userSockets: UserSocketMap,
  familyId: string,
  excludeUserId: string,
  update: Omit<FinanceUpdate, 'userId'>
): void {
  if (!familyId) return;
  
  const fullUpdate: FinanceUpdate = {
    ...update,
    userId: excludeUserId
  };
  
  io.to(`family:${familyId}`).emit('finance_update', fullUpdate);
}

interface FamilyUpdate {
  userId: string;
  type: string;
  userName?: string;
  members?: unknown[];
}

export function emitFamilyUpdate(
  io: SocketServer,
  _userSockets: UserSocketMap,
  familyId: string,
  excludeUserId: string,
  update: Omit<FamilyUpdate, 'userId'>
): void {
  if (!familyId) return;
  
  const fullUpdate: FamilyUpdate = {
    ...update,
    userId: excludeUserId
  };
  
  io.to(`family:${familyId}`).emit('family_update', fullUpdate);
}
