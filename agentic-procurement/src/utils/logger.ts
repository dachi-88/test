/* Minimal structured-ish logger with namespacing, no dependencies. */

const COLORS: Record<string, string> = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (c: keyof typeof COLORS, s: string) =>
  useColor ? `${COLORS[c]}${s}${COLORS.reset}` : s;

export function makeLogger(namespace: string) {
  return (msg: string, data?: unknown) => {
    const tag = paint('cyan', `[${namespace}]`);
    if (data !== undefined) {
      console.log(`${tag} ${msg}`, paint('dim', JSON.stringify(data)));
    } else {
      console.log(`${tag} ${msg}`);
    }
  };
}

export const log = {
  info: (m: string) => console.log(m),
  step: (m: string) => console.log(paint('magenta', `▸ ${m}`)),
  ok: (m: string) => console.log(paint('green', `✓ ${m}`)),
  warn: (m: string) => console.log(paint('yellow', `! ${m}`)),
  err: (m: string) => console.log(paint('red', `✗ ${m}`)),
  rule: () => console.log(paint('dim', '─'.repeat(60))),
};
