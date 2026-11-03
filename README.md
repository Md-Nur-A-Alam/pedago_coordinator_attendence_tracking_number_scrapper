# Pedago Attendance Dashboard (Chrome / Edge extension)

## Install
1. Unzip this folder.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.

## Use
1. Log in and open the attendance report page
   (`.../local/zoomattendance/report.php?id=...&occurrence=...`).
2. Click the extension icon → **Scrape this page & open dashboard**.
3. In the dashboard: sort by clicking any column header; filter by name, "Absent only",
   and attendance % (below / above / equal + a number); copy all phone numbers
   (comma-separated) for exactly the rows currently shown.

## What it scrapes
The "Participants of this class" table (the one with a Status column). The phone number is taken from inside the name cell and shown as its own Phone column. Teachers, "Matched but not expected" and "Unmatched Zoom participants" tables are ignored.

## If columns are detected wrongly
The dashboard auto-detects Name / Phone / Attendance % / Status from the table headers.
Fix them with the "Column mapping" dropdowns (remembered for next time).
"Absent only" matches the keyword (default `absent`) in the Status column, or in any cell
if no Status column is mapped. Change the keyword (e.g. `absent,no,✗`) if the page uses other wording.

## Developer photo
The dashboard header shows the developer avatar. It looks for `dev.jpg` in this folder first, then the
Facebook link, then falls back to a letter "N". Facebook image links expire, so save the photo as
`dev.jpg` next to `dashboard.html` (then reload the extension) to make it permanent.
