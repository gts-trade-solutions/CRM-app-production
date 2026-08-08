/**
 * Demo mode. Off unless explicitly switched on, because everything it
 * enables is unsafe on a real deployment: the one-click persona grid on the
 * login page, and the seed script that loads the fictional dataset.
 *
 * Deliberately a NEXT_PUBLIC_ variable so the login page and the server read
 * the same switch — there is nothing secret in it, it only says whether this
 * instance is a demo.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
