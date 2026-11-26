import { z } from 'zod';

// Use Zod's standard parser under the browser's strict Content Security Policy.
z.config({ jitless: true });

export { z };
