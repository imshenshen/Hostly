import { Action, ActionPanel, Color, Icon, List, Toast, getPreferenceValues, showToast } from "@raycast/api";
import { execFile } from "node:child_process";
import { useCallback, useEffect, useState } from "react";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ProfileData = {
  id: string;
  name: string;
  active: boolean;
  folder_id?: string;
  url?: string | null;
};

type FolderData = {
  id: string;
  name: string;
  multi_select: boolean;
  profiles: ProfileData[];
};

type HostlyListResponse = {
  folders: FolderData[];
};

type Preferences = {
  hostlyPath?: string;
};

const DEFAULT_HOSTLY_BIN = "/Applications/Hostly.app/Contents/MacOS/hostly-core";

function getHostlyBin() {
  const preferences = getPreferenceValues<Preferences>();
  const bin = preferences.hostlyPath?.trim();
  return bin && bin.length > 0 ? bin : DEFAULT_HOSTLY_BIN;
}

function extractJsonPayload(stdout: string) {
  const first = stdout.indexOf("{");
  const last = stdout.lastIndexOf("}");
  if (first < 0 || last < 0 || last <= first) {
    throw new Error("`hostly list` did not return valid JSON");
  }
  return stdout.slice(first, last + 1);
}

async function runHostly(args: string[]) {
  const { stdout, stderr } = await execFileAsync(getHostlyBin(), args, {
    encoding: "utf8",
    windowsHide: true,
  });
  return { stdout, stderr };
}

async function fetchFolders() {
  const { stdout } = await runHostly(["list"]);
  const payload = extractJsonPayload(stdout);
  const parsed = JSON.parse(payload) as HostlyListResponse;
  return parsed.folders ?? [];
}

async function toggleHost(profile: ProfileData) {
  const args = profile.active ? ["close", profile.name] : ["open", profile.name];
  await runHostly(args);
}

async function openHostlyApp() {
  await execFileAsync("open", ["-a", "Hostly"], {
    windowsHide: true,
  });
}

export default function Command() {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const next = await fetchFolders();
      setFolders(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load host list",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onToggle = useCallback(
    async (profile: ProfileData) => {
      if (isMutating) return;
      setIsMutating(true);
      try {
        await toggleHost(profile);
        await showToast({
          style: Toast.Style.Success,
          title: profile.active ? "Host disabled" : "Host enabled",
          message: profile.name,
        });
        await load();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await showToast({
          style: Toast.Style.Failure,
          title: "Toggle host failed",
          message,
        });
      } finally {
        setIsMutating(false);
      }
    },
    [isMutating, load],
  );

  const onOpenHostlyApp = useCallback(async () => {
    try {
      await openHostlyApp();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open Hostly",
        message,
      });
    }
  }, []);

  return (
    <List isLoading={isLoading || isMutating} searchBarPlaceholder="Search hosts...">
      {folders.map((folder) => (
        <List.Section key={folder.id} title={folder.name} subtitle={folder.multi_select ? "Multi" : "Single"}>
          {folder.profiles.map((profile) => (
            <List.Item
              key={profile.id}
              title={profile.name}
              icon={profile.active ? { source: Icon.CheckCircle, tintColor: Color.Green } : Icon.Circle}
              accessories={profile.url ? [{ icon: Icon.Cloud }] : undefined}
              actions={
                <ActionPanel>
                  <Action
                    title={profile.active ? "Disable Host" : "Enable Host"}
                    icon={profile.active ? Icon.XMarkCircle : Icon.CheckCircle}
                    onAction={() => onToggle(profile)}
                  />
                  <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={load} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ))}
      <List.Section title="Hostly App">
        <List.Item
          key="open-hostly-app"
          title="Open Hostly"
          icon={Icon.AppWindow}
          actions={
            <ActionPanel>
              <Action title="Open Hostly" icon={Icon.AppWindow} onAction={onOpenHostlyApp} />
              <Action title="Refresh" icon={Icon.ArrowClockwise} onAction={load} shortcut={{ modifiers: ["cmd"], key: "r" }} />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}
