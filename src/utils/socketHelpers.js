export function emitToFamily(io, userSockets, familyId, event, data) {
  if (!familyId) return;
  io.to(`family:${familyId}`).emit(event, data);
}

export function emitToUser(io, userSockets, userId, event, data) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    io.to(socketId).emit(event, data);
  }
}

export function notifyFamily(io, userSockets, familyId, excludeUserId, notification) {
  if (!familyId) return;
  io.to(`family:${familyId}`).emit('notification', notification);
}

export function emitFinanceUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) return;
  
  update.userId = excludeUserId;
  io.to(`family:${familyId}`).emit('finance_update', update);
}

export function emitFamilyUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) return;
  io.to(`family:${familyId}`).emit('family_update', update);
}
