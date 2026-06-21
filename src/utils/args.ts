export function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

export function readFlag(args: string[], flag: string) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1]?.trim();
}
