import { memo } from 'react';
import { Password } from '../password';

/**
 * Account tab: login & security (Discord's "My Account"). Today that's the
 * password change; identity/session management can grow here later. The
 * editable display name lives in Profile with the rest of the visual
 * identity, because the server updates them as one unit.
 */
const Account = memo(() => {
  return <Password />;
});

export { Account };
