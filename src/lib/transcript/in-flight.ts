/** Module-level set so React Strict Mode remounts cannot double-start the same job. */
export const inFlightJobs = new Set<string>();
