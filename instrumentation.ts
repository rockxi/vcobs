export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { deleteExpiredPastes } = await import("@/lib/pastes");
  const { deleteExpiredSharedFiles } = await import("@/lib/shared-files");
  const cleanup = async () => {
    await Promise.all([
      deleteExpiredPastes().catch((error) => console.error("Paste cleanup failed", error)),
      deleteExpiredSharedFiles().catch((error) => console.error("Shared file cleanup failed", error)),
    ]);
  };
  await cleanup();
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref();
}
