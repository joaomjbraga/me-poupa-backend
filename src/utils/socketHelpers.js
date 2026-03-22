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
  if (!familyId) {
    console.log('⚠️ notifyFamily called without familyId');
    return;
  }
  
  console.log(`📡 Emitting notification to family:${familyId}, excluding user:${excludeUserId}`);
  const room = `family:${familyId}`;
  
  for (const [, socket] of io.sockets.sockets) {
    if (socket.rooms?.has(room) && socket.data.userId !== excludeUserId) {
      socket.emit('notification', notification);
    }
  }
}

export function emitFinanceUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) {
    console.log('⚠️ emitFinanceUpdate called without familyId');
    return;
  }
  
  update.userId = excludeUserId;
  console.log(`📡 Emitting finance_update to family:${familyId}, sender:${excludeUserId}`, update);
  
  const room = `family:${familyId}`;
  let sentCount = 0;
  
  for (const [, socket] of io.sockets.sockets) {
    if (socket.rooms?.has(room) && socket.data.userId !== excludeUserId) {
      console.log(`📤 Sending finance_update to user:${socket.data.userId} (socket:${socket.id})`);
      socket.emit('finance_update', update);
      sentCount++;
    }
  }
  
  console.log(`📤 Total recipients: ${sentCount}`);
}

export function emitFamilyUpdate(io, userSockets, familyId, excludeUserId, update) {
  if (!familyId) {
    console.log('⚠️ emitFamilyUpdate called without familyId');
    return;
  }
  
  console.log(`📡 Emitting family_update to family:${familyId}, sender:${excludeUserId || 'none'}`, update);
  
  const room = `family:${familyId}`;
  let sentCount = 0;
  
  for (const [, socket] of io.sockets.sockets) {
    if (socket.rooms?.has(room) && socket.data.userId !== excludeUserId) {
      console.log(`📤 Sending family_update to user:${socket.data.userId} (socket:${socket.id})`);
      socket.emit('family_update', update);
      sentCount++;
    }
  }
  
  console.log(`📤 Total recipients: ${sentCount}`);
}
