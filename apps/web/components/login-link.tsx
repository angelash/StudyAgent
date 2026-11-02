'use client';
import * as React from 'react';
import Link from 'next/link';
import { isLoginReturnPath, workspaceLoginDestination } from '../lib/workspace-navigation';

/** A sign-in link that returns to the page being viewed; the login page still validates the destination. */
export function LoginLink({ kind = 'parent', className, children }: { kind?: 'parent' | 'student'; className?: string; children: React.ReactNode }) {
  const [href, setHref] = React.useState('/' + kind + '/login');
  React.useEffect(() => {
    const update = () => { const current = window.location.pathname + window.location.search; setHref('/' + kind + '/login' + (isLoginReturnPath(window.location.pathname) ? '?' + new URLSearchParams({ returnTo: current }) : '')); };
    update(); window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, [kind]);
  return <Link className={className} href={href}>{children}</Link>;
}

/** Keep the original activity while choosing another sign-in method. Authorization is checked after sign-in. */
export function LoginSwitchLink({ kind, className, children }: { kind: 'parent' | 'student'; className?: string; children: React.ReactNode }) {
  const [href, setHref] = React.useState('/' + kind + '/login');
  React.useEffect(() => {
    const update = () => {
      const original = new URLSearchParams(window.location.search).get('returnTo');
      setHref('/' + kind + '/login' + (original ? '?' + new URLSearchParams({ returnTo: original }) : ''));
    };
    update(); window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, [kind]);
  return <Link className={className} href={href}>{children}</Link>;
}

/** An already signed-in learner uses the same validated return destination as a new sign-in. */
export function LoginReturnLink({ role, className, children }: { role: string; className?: string; children: React.ReactNode }) {
  const [href, setHref] = React.useState('/studio');
  React.useEffect(() => {
    const update = () => setHref(workspaceLoginDestination(new URLSearchParams(window.location.search).get('returnTo'), role));
    update(); window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, [role]);
  return <Link className={className} href={href}>{children}</Link>;
}
