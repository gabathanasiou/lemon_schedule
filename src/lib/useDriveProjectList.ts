import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectMeta } from '../store';
import { listDriveProjectMetas, formatDriveError, getDriveErrorStatus } from './googleDriveStorage';
import type { useGoogleAuth } from './googleDriveAuth';

const MAX_DRIVE_ENTRIES = 5000;

export interface DriveProjectList {
  driveMetas: ProjectMeta[];
  driveLoading: boolean;
  driveError: string | null;
  driveAuthError: boolean;
  driveCorrupt: boolean;
  driveTotalCount: number | null;
  lastRefreshedAt: number | null;
  refetchDrive: () => void;
  setDriveMetas: React.Dispatch<React.SetStateAction<ProjectMeta[]>>;
  setDriveError: React.Dispatch<React.SetStateAction<string | null>>;
  setDriveCorrupt: React.Dispatch<React.SetStateAction<boolean>>;
  setDriveTotalCount: React.Dispatch<React.SetStateAction<number | null>>;
}

type Auth = ReturnType<typeof useGoogleAuth>;

/**
 * Fetches the Drive project index (on mount + on demand) with corruption
 * detection and 401 → token-refresh handling. Used by ProjectManager.
 */
export function useDriveProjectList(auth: Auth): DriveProjectList {
  const [driveMetas, setDriveMetas] = useState<ProjectMeta[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveAuthError, setDriveAuthError] = useState(false);
  const [driveCorrupt, setDriveCorrupt] = useState(false);
  const [driveTotalCount, setDriveTotalCount] = useState<number | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);

  const refetchDrive = useCallback(() => {
    if (!auth.accessToken) return;
    setDriveLoading(true);
    setDriveError(null);
    setDriveCorrupt(false);
    setDriveTotalCount(null);
    setDriveAuthError(false);
    listDriveProjectMetas(auth.accessToken)
      .then(metas => {
        setDriveTotalCount(metas.length);
        if (metas.length > MAX_DRIVE_ENTRIES) {
          setDriveCorrupt(true);
          setDriveError(`Drive data is corrupted: ${metas.length.toLocaleString()} entries found. Use the debug cleanup to wipe and start fresh.`);
          setDriveMetas([]);
        } else {
          setDriveMetas(metas.map(m => ({
            id: m.id,
            title: m.title,
            lastModified: m.lastModified,
            createdAt: m.createdAt,
            driveFileId: m.driveFileId,
          })));
        }
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      })
      .catch(e => {
        setDriveError(formatDriveError(e, 'Failed to load cloud projects'));
        const isAuthError = getDriveErrorStatus(e) === 401;
        setDriveAuthError(isAuthError);
        if (isAuthError) auth.refreshToken();
        setDriveLoading(false);
        setLastRefreshedAt(Date.now());
      });
  }, [auth.accessToken, auth.refreshToken]);

  const refetchDriveRef = useRef(refetchDrive);
  refetchDriveRef.current = refetchDrive;

  // Fetch Drive index on mount
  useEffect(() => {
    if (!auth.isSignedIn || !auth.accessToken) {
      setDriveMetas([]);
      setDriveError(null);
      setDriveCorrupt(false);
      setDriveTotalCount(null);
      return;
    }
    refetchDriveRef.current();
  }, [auth.isSignedIn, auth.accessToken]);

  return {
    driveMetas, driveLoading, driveError, driveAuthError, driveCorrupt,
    driveTotalCount, lastRefreshedAt, refetchDrive,
    setDriveMetas, setDriveError, setDriveCorrupt, setDriveTotalCount,
  };
}
