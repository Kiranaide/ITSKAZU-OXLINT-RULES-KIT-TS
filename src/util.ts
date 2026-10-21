export const lastLines = (text: string, count: number): string => text.trim().split("\n").slice(-count).join("\n");
