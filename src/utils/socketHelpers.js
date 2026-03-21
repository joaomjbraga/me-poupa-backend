export function emitToFamily(io, userSockets, familyId, event, data) {
  if (!familyId) return;
  
  console.log(`📡 Emitting ${event} to family:${familyId}`);
  io.to(`family:${familyId}`).emit(event, data);
}

export function emitToUser(io, userSockets, userId, event, data) {
  const socketId = userSockets.get(userId);
  if (socketId) {
    console.log(`📡 Emitting ${event} to user socket:${socketId}`);
    io.to(socketId).emit(event, data);
  }
}

export function notifyFamily(io, userSockets, familyId, excludeUserId, notification) {
  if (!familyId) return;
  
  console.log(`📡 Emitting notification to family:${familyId}`);
  const familyRoom = `family:${familyId}`;
  io.to(familyRoom).emit('notification', notification);
}

export function emitFinanceUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) {
    console.log('⚠️ emitFinanceUpdate called without familyId');
    return;
  }
  
  update.userId = excludeUserId;
  console.log(`📡 Emitting finance_update to family:${familyId}`, update);
  const familyRoom = `family:${familyId}`;
  io.to(familyRoom).emit('finance_update', update);
}

export function emitFamilyUpdate(io, userSockets, familyId, update) {
  if (!familyId) {
    console.log('⚠️ emitFamilyUpdate called without familyId');
    return;
  }
  
  console.log(`📡 Emitting family_update to family:${familyId}`, update);
  const familyRoom = `family:${familyId}`;
  io.to(familyRoom).emit('family_update', update);
}
