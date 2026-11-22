# Video markers

A coach drops the recording of a game into a video editor with one file from FirstPass and finds a named, coloured marker on every event the statistician recorded: goals and misses by shooter, centre passes, gains, turnovers, feeds, penalties, substitutions, quarter starts and ends, and marked moments. (Issue #13.)

## Where to make the file

| Where | Who | How the video is lined up |
|---|---|---|
| Vantage: **Export**, then **Video markers** | the statistician | type how far into the video the first quarter starts |
| Vision: **Report**, then **Video markers** | the team's coaches and managers | the same |
| FirstPass Studio: the Recordings tab | the producer | from the recorder's timecode, which Studio already follows |

The three need not match. Studio knows the recorder's timecode and adds the producer's own marked moments; Vantage and Vision work for any video from any camera.

## Lining up the video (Vantage and Vision)

1. Open the video and find the moment the first quarter starts. The statistician starts the clock in Vantage at that moment.
2. Type how far into the video that is, such as `3:12` or `1:03:12`.
3. Pick the video's frames a second (25 for most cameras in Australia).
4. Choose the file.

Every event is placed by the time on the tablet's clock when it was recorded, which keeps running through injuries and breaks as the video does. Each marker sits 5 seconds before the statistician's tap (in Vantage: 0, 3, 5 or 8), because the tap comes after the play. Quarter starts and ends sit on the tap.

## The files

| File | For | How to use it |
|---|---|---|
| `.edl` | DaVinci Resolve | Put the video at the very start of a new timeline (it starts at 01:00:00:00). Then Timelines, Import, Timeline Markers from EDL. An EDL has no room for notes, so the marker's name carries everything. |
| `.xml` | Adobe Premiere Pro, and Resolve | File, Import brings in a sequence that holds the markers (name and note). Put the video at its very start. Final Cut Pro 7 XML. |
| `.txt` | anyone | Each moment as a time into the video, to read beside any player. |

If the game is in more than one video file, make one file per video: for a later video, work out how far before its start the first quarter began and line that video up on its own timeline. Events recorded before the video starts are left out and counted.

## Who is named

The files name players. Vantage and Vision make them for the team's own statistician, coaches and managers, who already see those names, and every screen and the list file say: "For the coaching team. This file names players: keep it within the team and do not post it publicly." Studio's file names a player only where HQ says they may be named in public (`may_publish`); everyone else is marked by position alone.

## Not yet tried

The files are written to each editor's published format and tested as text. They have not been imported into a real copy of Resolve or Premiere, nor lined up against a real recording. The first recorded game is the test.

## In the code

`packages/engine/src/markers.ts`: `videoMarkers` (events to markers), `placeMarkers` (markers to frames), `markersEdl`, `markersXml`, `markersList`, `markerFile`, `markersFromClockStart`. The apps only collect the choices and save the file (`apps/vantage/src/components/MarkersSection.tsx`, `apps/vision/src/components/MarkersPanel.tsx`).
