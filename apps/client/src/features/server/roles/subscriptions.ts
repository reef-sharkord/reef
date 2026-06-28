import type { ServerSubscriptor } from '@/features/server/subscriptions';
import { runWithActiveStore } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import type { TJoinedRole } from '@sharkord/shared';
import { addRole, removeRole, updateRole } from './actions';

const subscribeToRoles: ServerSubscriptor = (trpc, store) => {
  const onRoleCreateSub = trpc.roles.onCreate.subscribe(undefined, {
    onData: (role: TJoinedRole) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] roles.onCreate', { role });
        addRole(role);
      }),
    onError: (err) => console.error('onRoleCreate subscription error:', err)
  });

  const onRoleDeleteSub = trpc.roles.onDelete.subscribe(undefined, {
    onData: (roleId: number) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] roles.onDelete', { roleId });
        removeRole(roleId);
      }),
    onError: (err) => console.error('onRoleDelete subscription error:', err)
  });

  const onRoleUpdateSub = trpc.roles.onUpdate.subscribe(undefined, {
    onData: (role: TJoinedRole) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] roles.onUpdate', { role });
        updateRole(role.id, role);
      }),
    onError: (err) => console.error('onRoleUpdate subscription error:', err)
  });

  return () => {
    onRoleCreateSub.unsubscribe();
    onRoleDeleteSub.unsubscribe();
    onRoleUpdateSub.unsubscribe();
  };
};

export { subscribeToRoles };
