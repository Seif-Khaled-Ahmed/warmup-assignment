const fs = require("fs");

// spent like 2 hrs debugging this lol
function convertTime(inp) {
  var chunk = inp.trim().split(" ");
  var abc = chunk[0].split(":");
  var hh = Number(abc[0]);
  var mm = Number(abc[1]);
  var ss = Number(abc[2]);
  var half = chunk[1].toLowerCase();

  if (half === "am" && hh === 12) hh = 0;
  if (half === "pm" && hh !== 12) hh += 12;

  return hh * 3600 + mm * 60 + ss;
}

function formatBack(x) {
  var hh = Math.floor(x / 3600);
  var mm = Math.floor((x % 3600) / 60);
  var ss = x % 60;
  return (
    hh + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0")
  );
}

// idk why they want us to return strings instead of numbers but ok
function getShiftDuration(startTime, endTime) {
  var t1 = convertTime(startTime);
  var t2 = convertTime(endTime);
  return formatBack(t2 - t1);
}

function getIdleTime(startTime, endTime) {
  var t1 = convertTime(startTime);
  var t2 = convertTime(endTime);

  var wasted = 0;
  // anything before 8am doesnt count as delivery time
  if (t1 < 28800) {
    if (t2 < 28800) {
      wasted = t2 - t1;
    } else {
      wasted = 28800 - t1;
    }
  }
  // same for after 10pm
  if (t2 > 79200) {
    if (t1 > 79200) {
      wasted += t2 - t1;
    } else {
      wasted += t2 - 79200;
    }
  }

  return formatBack(wasted);
}

function getActiveTime(shiftDuration, idleTime) {
  var aa = shiftDuration.split(":");
  var bb = idleTime.split(":");
  var total = Number(aa[0]) * 3600 + Number(aa[1]) * 60 + Number(aa[2]);
  var idle = Number(bb[0]) * 3600 + Number(bb[1]) * 60 + Number(bb[2]);
  return formatBack(total - idle);
}

function metQuota(date, activeTime) {
  var tmp = activeTime.split(":");
  var sec = Number(tmp[0]) * 3600 + Number(tmp[1]) * 60 + Number(tmp[2]);

  // splitting date to check eid period
  var dd = date.split("-");

  // prof said eid was apr 10-30 2025
  if (
    Number(dd[0]) == 2025 &&
    Number(dd[1]) == 4 &&
    Number(dd[2]) >= 10 &&
    Number(dd[2]) <= 30
  ) {
    if (sec >= 21600) return true; // 6 hrs
    return false;
  }

  // normal day = 8h 24min
  if (sec >= 30240) return true;
  return false;
}

function addShiftRecord(textFile, shiftObj) {
  var raw = fs.readFileSync(textFile, "utf-8");
  var allLines = raw.trim().split("\n");
  // filter blanks (was getting bugs from empty lines at the end)
  var good = [];
  for (var q = 0; q < allLines.length; q++) {
    if (allLines[q].trim() !== "") good.push(allLines[q]);
  }

  // duplicate check - same driver same date = skip
  for (var q = 0; q < good.length; q++) {
    var rr = good[q].split(",");
    if (rr[0].trim() == shiftObj.driverID && rr[2].trim() == shiftObj.date) {
      return {};
    }
  }

  var dur = getShiftDuration(shiftObj.startTime, shiftObj.endTime);
  var idl = getIdleTime(shiftObj.startTime, shiftObj.endTime);
  var act = getActiveTime(dur, idl);
  var mq = metQuota(shiftObj.date, act);

  // building the row manually cuz template literals were being weird
  var csvRow =
    shiftObj.driverID +
    "," +
    shiftObj.driverName +
    "," +
    shiftObj.date +
    "," +
    shiftObj.startTime +
    "," +
    shiftObj.endTime +
    "," +
    dur +
    "," +
    idl +
    "," +
    act +
    "," +
    String(mq) +
    "," +
    "false";

  // gotta insert after the last row of this driver if they already have records
  var spot = -1;
  for (var q = 0; q < good.length; q++) {
    var rid = good[q].split(",")[0].trim();
    if (rid === shiftObj.driverID) {
      spot = q; // keep updating so we get the LAST one
    }
  }
  if (spot === -1) {
    good.push(csvRow);
  } else {
    good.splice(spot + 1, 0, csvRow);
  }

  fs.writeFileSync(textFile, good.join("\n"));

  var out = {
    driverID: shiftObj.driverID,
    driverName: shiftObj.driverName,
    date: shiftObj.date,
    startTime: shiftObj.startTime,
    endTime: shiftObj.endTime,
    shiftDuration: dur,
    idleTime: idl,
    activeTime: act,
    metQuota: mq,
    hasBonus: false,
  };
  return out;
}

function setBonus(textFile, driverID, date, newValue) {
  var stuff = fs.readFileSync(textFile, "utf-8");
  var lns = stuff.split("\n");
  for (var i = 0; i < lns.length; i++) {
    if (lns[i].trim() == "") continue;
    var cc = lns[i].split(",");
    if (cc[0].trim() == driverID && cc[2].trim() == date) {
      cc[9] = String(newValue);
      lns[i] = cc.join(",");
      break; // found it, done
    }
  }
  fs.writeFileSync(textFile, lns.join("\n"));
}

function countBonusPerMonth(textFile, driverID, month) {
  var fileStr = fs.readFileSync(textFile, "utf-8").trim();
  if (!fileStr) return -1;
  var lns = fileStr.split("\n");

  var found = false;
  var tally = 0;
  var mo = parseInt(month); // handles both "4" and "04"

  for (var i = 0; i < lns.length; i++) {
    if (!lns[i].trim()) continue;
    var cc = lns[i].split(",");
    var thisID = cc[0].trim();

    if (thisID === driverID) {
      found = true;
      var recordMonth = parseInt(cc[2].trim().split("-")[1]);
      var bonusVal = cc[9].trim();
      if (recordMonth === mo && bonusVal === "true") {
        tally++;
      }
    }
  }
  if (!found) return -1;
  return tally;
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {
  var fileStr = fs.readFileSync(textFile, "utf-8").trim();
  var lns = fileStr.split("\n");
  var sum = 0;

  for (var i = 0; i < lns.length; i++) {
    if (!lns[i].trim()) continue;
    var cc = lns[i].split(",");
    if (cc[0].trim() !== driverID) continue;

    var mm = parseInt(cc[2].trim().split("-")[1]);
    if (mm !== month) continue;

    // grab active time col and add to running total
    var pp = cc[7].trim().split(":");
    sum += Number(pp[0]) * 3600 + Number(pp[1]) * 60 + Number(pp[2]);
  }
  return formatBack(sum);
}

function getRequiredHoursPerMonth(
  textFile,
  rateFile,
  bonusCount,
  driverID,
  month,
) {
  // need to know their day off from the rates file
  var rateRaw = fs.readFileSync(rateFile, "utf-8").trim().split("\n");
  var offDay;
  for (var i = 0; i < rateRaw.length; i++) {
    var rc = rateRaw[i].split(",");
    if (rc[0].trim() === driverID) {
      offDay = rc[1].trim();
      break;
    }
  }

  var shiftRaw = fs.readFileSync(textFile, "utf-8").trim().split("\n");
  var reqTotal = 0;
  // need this for getUTCDay
  var dayArr = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  for (var i = 0; i < shiftRaw.length; i++) {
    if (!shiftRaw[i].trim()) continue;
    var cc = shiftRaw[i].split(",");
    if (cc[0].trim() !== driverID) continue;
    var theDate = cc[2].trim();
    var mm = parseInt(theDate.split("-")[1]);
    if (mm !== month) continue;

    // skip if its their off day
    var dObj = new Date(theDate + "T00:00:00Z");
    var whichDay = dayArr[dObj.getUTCDay()];
    if (whichDay === offDay) continue;

    // eid check (again lol)
    var dp = theDate.split("-");
    if (
      parseInt(dp[0]) == 2025 &&
      parseInt(dp[1]) == 4 &&
      parseInt(dp[2]) >= 10 &&
      parseInt(dp[2]) <= 30
    ) {
      reqTotal += 21600;
    } else {
      reqTotal += 30240;
    }
  }

  // 2 hrs off per bonus
  reqTotal = reqTotal - bonusCount * 7200;
  return formatBack(reqTotal);
}

function getNetPay(driverID, actualHours, requiredHours, rateFile) {
  var rr = fs.readFileSync(rateFile, "utf-8").trim().split("\n");
  var pay, lvl;
  for (var i = 0; i < rr.length; i++) {
    var cc = rr[i].split(",");
    if (cc[0].trim() == driverID) {
      pay = parseInt(cc[2].trim());
      lvl = parseInt(cc[3].trim());
      break;
    }
  }

  var aP = actualHours.split(":");
  var rP = requiredHours.split(":");
  var aSec = Number(aP[0]) * 3600 + Number(aP[1]) * 60 + Number(aP[2]);
  var rSec = Number(rP[0]) * 3600 + Number(rP[1]) * 60 + Number(rP[2]);

  // no deduction needed
  if (aSec >= rSec) {
    return pay;
  }

  var gap = rSec - aSec;

  // grace period depends on tier... had to reread the pdf for this part
  var grace;
  if (lvl == 1) grace = 50;
  else if (lvl == 2) grace = 20;
  else if (lvl == 3) grace = 10;
  else grace = 3;

  gap = gap - grace * 3600;
  if (gap <= 0) return pay;

  // only full hours matter for deduction apparently
  var fullHrs = Math.floor(gap / 3600);
  var perHr = Math.floor(pay / 185);

  return pay - fullHrs * perHr;
}

module.exports = {
  getShiftDuration,
  getIdleTime,
  getActiveTime,
  metQuota,
  addShiftRecord,
  setBonus,
  countBonusPerMonth,
  getTotalActiveHoursPerMonth,
  getRequiredHoursPerMonth,
  getNetPay,
};
