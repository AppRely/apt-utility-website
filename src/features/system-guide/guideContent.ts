export type SystemGuideStep = {
  selector: string;
  title: string;
  description: string;
  allowInteraction?: boolean;
};

export const systemGuideSteps: Record<string, SystemGuideStep[]> = {
  "/": [
    {
      selector: '[data-system-guide="landing-home"]',
      title: "Project home",
      description:
        "This is the starting point for APT Vision. Create a project here or browse the project list below.",
    },
    {
      selector: '[data-system-guide="create-project"]',
      title: "Open the project form",
      allowInteraction: true,
      description:
        "Use this button when you have a source video ready. Click it now to open the real creation form, then choose Next in this guide.",
    },
    {
      selector: '[data-system-guide="project-form"]',
      title: "Project upload workflow",
      description:
        "This form collects a project name, one required source video, and an optional tracking file. The next steps explain each real field before anything is submitted.",
    },
    {
      selector: '[data-system-guide="project-name"]',
      title: "Name the project",
      description:
        "Enter a unique project name with at least three characters. The form prevents submission when the name is too short or matches an existing project name.",
    },
    {
      selector: '[data-system-guide="video-upload"]',
      title: "Upload the required video",
      description:
        "Choose one source video. Frontend validation accepts .avi, .mp4, .mov, .ufmf, .mjpeg, and .mjpg files, and a video is required before creation.",
    },
    {
      selector: '[data-system-guide="tracking-upload"]',
      title: "Add tracking data if available",
      description:
        "The tracking file is optional. The UI suggests .trk, .json, .csv, and .xml, but this frontend does not enforce a tracking-file extension; actual processing support is determined by the backend.",
    },
    {
      selector: '[data-system-guide="project-submit"]',
      title: "Start project creation",
      description:
        "Create validates the form and sends the selected files through the existing project workflow. The dialog closes, a temporary Creating row appears, and the list refreshes after success. Exit the tour before submitting a real project.",
    },
    {
      selector: '[data-system-guide="project-list"]',
      title: "Browse your projects",
      description:
        "All projects appear in one table. Use search to find a project, then use its row to continue into the annotation workspace.",
    },
    {
      selector: '[data-system-guide="project-open"]',
      title: "Open a project by name",
      description:
        "Select a completed project's name to store its details for the session and open its annotation workspace. If no row exists yet, finish creating and processing a project first.",
    },
    {
      selector: '[data-system-guide="project-edit"]',
      title: "Edit an existing project",
      description:
        "Edit opens the selected project's existing annotation workspace. It uses the same safe navigation as the project name; it does not change project files or metadata from this screen.",
    },
    {
      selector: '[data-system-guide="project-audit"]',
      title: "Review the audit log",
      allowInteraction: true,
      description:
        "Click the highlighted Audit button to open this project's recorded trajectory operations without leaving the project list, then choose Next to explore the dialog.",
    },
    {
      selector: '[data-system-guide="audit-dialog"]',
      title: "Activity log dialog",
      description:
        "The real Activity Logs dialog opens automatically at this step. It shows the selected project's affected object IDs, frame ranges, operation, and update time.",
    },
    {
      selector: '[data-system-guide="audit-export"]',
      title: "Export the audit history",
      description:
        "Export CSV downloads the available activity history for this project. It remains disabled when there are no log rows to export.",
    },
    {
      selector: '[data-system-guide="audit-table"]',
      title: "Inspect recorded operations",
      description:
        "Review the newest operations in this scrollable area. Loading, empty, and error messages appear here as well, so the guide remains attached to the correct part of the dialog.",
    },
    {
      selector: '[data-system-guide="project-delete"]',
      title: "Delete a project",
      description:
        "Delete opens a confirmation dialog and permanently removes the project through the existing deletion workflow. Use it only when the project is no longer needed.",
    },
  ],
  "/dashboard": [
    {
      selector: '[data-system-guide="sidebar-project"]',
      title: "Current project and back navigation",
      description:
        "The sidebar identifies the active project, video, and tracking file. The arrow returns to the previous screen without changing annotation data.",
    },
    {
      selector: '[data-system-guide="sidebar-selection"]',
      title: "Selected objects",
      description:
        "Objects selected from the video, object list, or review tables appear here with their IDs and frame ranges. Clear removes the current selection and any captured clip range.",
    },
    {
      selector: '[data-system-guide="sidebar-swap"]',
      title: "Swap",
      description:
        "Use Swap after selecting exactly two objects. It opens confirmation before exchanging their tracking assignments.",
    },
    {
      selector: '[data-system-guide="sidebar-break"]',
      title: "Break",
      description:
        "Use Break with exactly one selected object at the desired frame. A dialog asks whether to split before or after the current frame.",
    },
    {
      selector: '[data-system-guide="sidebar-link"]',
      title: "Link",
      description:
        "Use Link to combine compatible trajectory segments. With two objects selected it links them; with one object it can use an available continuation candidate. Overlapping ranges require a choice of ID.",
    },
    {
      selector: '[data-system-guide="sidebar-delete"]',
      title: "Delete trajectory",
      description:
        "Use Delete with exactly one selected object. It opens confirmation before removing that trajectory; this is different from deleting an entire project on the Projects screen.",
    },
    {
      selector: '[data-system-guide="sidebar-interpolate"]',
      title: "Interpolate",
      description:
        "Use Interpolate with one object to fill gaps inside it, or with two compatible segments to fill positions between them. Successful changes refresh the affected data.",
    },
    {
      selector: '[data-system-guide="sidebar-confusion"]',
      title: "Recalculate confusion",
      description:
        "Confusion starts the existing asynchronous confusion recalculation. The button reports progress and a notification reports completion or failure.",
    },
    {
      selector: '[data-system-guide="sidebar-clip"]',
      title: "Clip a frame range",
      description:
        "Select one object and capture two frame boundaries with Ctrl+C. Clip becomes available for a valid range and asks for confirmation before removing that interval.",
    },
    {
      selector: '[data-system-guide="sidebar-object-list"]',
      title: "Object list",
      description:
        "Expand Object List to inspect and select loaded trajectories. Selection here feeds the same Selected Objects area and operation buttons above.",
    },
    {
      selector: '[data-system-guide="video-canvas"]',
      title: "Video annotation workspace",
      description:
        "Inspect IDs, keypoints, skeletons, bounding boxes, trails, and suggestions on the video. Click an annotation to select it; Ctrl-click can fill the second selection slot.",
    },
    {
      selector: '[data-system-guide="workspace-menu-trigger"]',
      title: "Open workspace tools",
      allowInteraction: true,
      description:
        "This menu contains display settings and review/navigation tools. Click the highlighted menu button now, then choose Next to tour its actual items.",
    },
    {
      selector: '[data-system-guide="menu-auto-pan"]',
      title: "Auto-pan",
      description:
        "Auto-pan keeps a selected object near the viewport while reviewing zoomed video. The menu item toggles the behavior on or off.",
    },
    {
      selector: '[data-system-guide="menu-colors"]',
      title: "Annotation color palette",
      description:
        "Switch between colors intended for lighter or darker source video so annotations remain visible.",
    },
    {
      selector: '[data-system-guide="menu-skeleton"]',
      title: "Skeleton overlay",
      description:
        "Toggle skeleton edges when the project provides a skeleton graph. This changes only how annotations are displayed.",
    },
    {
      selector: '[data-system-guide="menu-auto-interpolation"]',
      title: "Auto interpolation",
      description:
        "Toggle the workspace's automatic interpolation behavior. Its current setting is shared with the sidebar through session storage.",
    },
    {
      selector: '[data-system-guide="menu-trajectory-length"]',
      title: "Trajectory trail length",
      description:
        "Choose how many historical frames are drawn in each visible trajectory trail. This changes only the video display.",
    },
    {
      selector: '[data-system-guide="menu-label-offset"]',
      title: "Annotation label offset",
      description:
        "Move object-ID labels closer to or farther from their keypoints to improve readability on crowded video.",
    },
    {
      selector: '[data-system-guide="menu-text-size"]',
      title: "Annotation text size",
      description:
        "Scale object-ID text without changing the tracking data or source video.",
    },
    {
      selector: '[data-system-guide="menu-export"]',
      title: "Export corrected tracking data",
      description:
        "Export TRK asks the backend to prepare the current corrected tracking file. When ready, this item becomes Download TRK for the generated version.",
    },
    {
      selector: '[data-system-guide="menu-refresh"]',
      title: "Refresh workspace data",
      description:
        "Refresh Data reloads dashboard data after external or recent changes. It is also available with Ctrl+R.",
    },
    {
      selector: '[data-system-guide="menu-unique-ids"]',
      title: "Unique IDs table",
      description:
        "Unique IDs opens the Linking Table in a separate browser window. Selecting a row can send an object and frame back to this dashboard.",
    },
    {
      selector: '[data-system-guide="menu-trajectory-lengths"]',
      title: "Browse by trajectory length",
      description:
        "Open a sortable list of trajectories from longest to shortest or shortest to longest. Choosing one selects it and jumps to its first frame.",
    },
    {
      selector: '[data-system-guide="menu-object-selection"]',
      title: "Object selection guide",
      description:
        "Show the visible-object keyboard assignments over the video. Number keys select Object 1, and Ctrl plus a number selects Object 2.",
    },
    {
      selector: '[data-system-guide="menu-shortcuts"]',
      title: "Keyboard shortcuts",
      description:
        "Open the built-in shortcut reference for playback, navigation, view controls, selections, and trajectory operations.",
    },
    {
      selector: '[data-system-guide="menu-confusion"]',
      title: "Confusion table",
      description:
        "Confusion opens the calculated confusion rows in a separate browser window. Selecting a row sends its frame back to the dashboard.",
    },
    {
      selector: '[data-system-guide="control-undo"]',
      title: "Undo",
      description:
        "Undo the most recent supported trajectory operation. It is disabled when the current project has nothing available to undo.",
    },
    {
      selector: '[data-system-guide="control-redo"]',
      title: "Redo",
      description:
        "Reapply the most recently undone supported operation. The workspace refreshes affected data after success.",
    },
    {
      selector: '[data-system-guide="control-previous-frame"]',
      title: "Previous frame",
      description:
        "Move backward by one video frame for precise inspection. The Left Arrow keyboard shortcut performs the same action.",
    },
    {
      selector: '[data-system-guide="control-play"]',
      title: "Play or pause",
      description:
        "Start or pause video playback. Space or P provides the same control when focus is not in an input.",
    },
    {
      selector: '[data-system-guide="control-next-frame"]',
      title: "Next frame",
      description:
        "Move forward by one video frame for precise inspection. The Right Arrow keyboard shortcut performs the same action.",
    },
    {
      selector: '[data-system-guide="control-seek"]',
      title: "Video seek bar",
      description:
        "Drag across the source video's duration to move quickly to another time and corresponding frame.",
    },
    {
      selector: '[data-system-guide="control-zoom-out"]',
      title: "Zoom out",
      description:
        "Reduce video magnification to see more of the frame. The minus key provides the corresponding shortcut.",
    },
    {
      selector: '[data-system-guide="control-zoom-reset"]',
      title: "Reset zoom",
      description:
        "Return the video viewport to its default magnification and position after zooming or panning.",
    },
    {
      selector: '[data-system-guide="control-zoom-in"]',
      title: "Zoom in",
      description:
        "Magnify the video for close annotation inspection. The equals key provides the corresponding shortcut.",
    },
    {
      selector: '[data-system-guide="control-track"]',
      title: "Trajectory trails",
      description:
        "Toggle historical trajectory trails on the video. Use the workspace menu to configure how many frames are drawn.",
    },
    {
      selector: '[data-system-guide="control-speed"]',
      title: "Playback speed",
      description:
        "Open the speed control to choose a playback rate from 0.1x through 16x while retaining the source FPS reference.",
    },
    {
      selector: '[data-system-guide="control-frame-jump"]',
      title: "Jump to a frame",
      description:
        "Enter an exact frame number and confirm with Enter or the adjacent button to navigate directly to it.",
    },
    {
      selector: '[data-system-guide="trajectory-timeline"]',
      title: "Trajectory timeline",
      description:
        "Compare object or skeleton coordinates and ranges around the current frame. Purple marks a clip range, amber marks a selected gap, and red marks the current frame.",
    },
  ],
  "/popup/unique-ids": [
    {
      selector: '[data-system-guide="unique-ids-header"]',
      title: "Unique IDs linking table",
      description:
        "This popup is opened from the dashboard workspace menu or with M. It helps inspect trajectory IDs and nearby continuation candidates.",
    },
    {
      selector: '[data-system-guide="unique-ids-table"]',
      title: "Select IDs and return to the video",
      description:
        "Select a row to highlight an ID and send its relevant frame to the dashboard window. Up to two IDs can be selected for linking review.",
    },
  ],
  "/popup/confusion": [
    {
      selector: '[data-system-guide="confusion-header"]',
      title: "Confusion review",
      description:
        "This popup is opened from the dashboard workspace menu or with C. It waits for the existing confusion calculation and displays its rows when ready.",
    },
    {
      selector: '[data-system-guide="confusion-table"]',
      title: "Jump to a confusing frame",
      description:
        "Choose a table row to send its frame back to the dashboard for closer video inspection.",
    },
  ],
};
