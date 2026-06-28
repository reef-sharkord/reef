import type { ServerSubscriptor } from '@/features/server/subscriptions';
import { runWithActiveStore } from '@/features/store';
import { logDebug } from '@/helpers/browser-logger';
import type { TCategory } from '@sharkord/shared';
import { addCategory, removeCategory, updateCategory } from './actions';

const subscribeToCategories: ServerSubscriptor = (trpc, store) => {
  const onCategoryCreateSub = trpc.categories.onCreate.subscribe(undefined, {
    onData: (category: TCategory) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] categories.onCreate', { category });
        addCategory(category);
      }),
    onError: (err) => console.error('onCategoryCreate subscription error:', err)
  });

  const onCategoryDeleteSub = trpc.categories.onDelete.subscribe(undefined, {
    onData: (categoryId: number) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] categories.onDelete', { categoryId });
        removeCategory(categoryId);
      }),
    onError: (err) => console.error('onCategoryDelete subscription error:', err)
  });

  const onCategoryUpdateSub = trpc.categories.onUpdate.subscribe(undefined, {
    onData: (category: TCategory) =>
      runWithActiveStore(store, () => {
        logDebug('[EVENTS] categories.onUpdate', { category });
        updateCategory(category.id, category);
      }),
    onError: (err) => console.error('onCategoryUpdate subscription error:', err)
  });

  return () => {
    onCategoryCreateSub.unsubscribe();
    onCategoryDeleteSub.unsubscribe();
    onCategoryUpdateSub.unsubscribe();
  };
};

export { subscribeToCategories };
