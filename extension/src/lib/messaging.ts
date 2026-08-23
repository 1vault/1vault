import type { Msg, MsgResult } from "../background/index";

export async function sendBg<T = unknown>(message: Msg): Promise<T> {
  const res = (await chrome.runtime.sendMessage(message)) as MsgResult;
  if (!res?.ok) throw new Error(res?.error ?? "background request failed");
  return res.data as T;
}
