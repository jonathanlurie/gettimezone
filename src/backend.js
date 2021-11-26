import fs from 'fs/promises'
import { join } from 'path'
import pointInPolygon from 'robust-point-in-polygon'
import SunCalc from 'suncalc' // https://github.com/mourner/suncalc
import bvh from '/data/bvh.json'


const polygonCache = {}


function hitBvh(bvh, point) {
  const hitBoxes = []

  function isInsideBox(box, point) {
    return point[0] >= box[0][0] && point[0] <= box[1][0]
    && point[1] >= box[0][1] && point[1] <= box[1][1]
  }

  function h(b) {
    if(b.l && isInsideBox(b.l.b, point)) {
      hitBoxes.push(b.l)
      h(b.l)
    }

    if(b.r && isInsideBox(b.r.b, point)) {
      hitBoxes.push(b.r)
      h(b.r)
    }
  }

  if (isInsideBox(bvh.b, point)) {
    h(bvh)
  }
  
  const leaves = hitBoxes.filter(b => !b.l)
  const candidatePolygons = []

  for (let b = 0; b < leaves.length; b += 1) {
    const polygonList = leaves[b].p
    for (let p = 0; p < polygonList.length; p += 1) {
      const pol = polygonList[p]
      const polAABB = pol.b

      if (point[0] >= polAABB[0][0] && point[0] <= polAABB[1][0]
        && point[1] >= polAABB[0][1] && point[1] <= polAABB[1][1]) {
          candidatePolygons.push(pol)
        }
    }
  }

  return candidatePolygons
}


async function loadPolygon(tzId, index) {
  if (tzId in polygonCache && index in polygonCache[tzId]) {
    return polygonCache[tzId][index]
  }

  try {
    const polygonPath = join('data', 'tz_bin', tzId, `${index}.bin`)
    console.log('Polygon for timezone ', decodeURIComponent(tzId), ' is file ', polygonPath)
    const binary = await fs.readFile(polygonPath)
    const arrayBuffer = new Uint8Array(binary).buffer
    const polygonStreamline = new Float32Array(arrayBuffer)
    const polygon = []
    for (let i = 0; i < polygonStreamline.length; i += 2) {
      polygon.push([
        polygonStreamline[i],
        polygonStreamline[i + 1]
      ])
    }

    if (!(tzId in polygonCache)) {
      polygonCache[tzId] = {}
    }
    polygonCache[tzId][index] = polygon
    return polygon
  } catch(e) {
    console.log(e)
  }

  return null
}


export async function getTimezoneId(point) {
  let candidatePolygons = hitBvh(bvh, point)

  // load the necessar  y polygons
  for (let i = 0; i < candidatePolygons.length; i += 1) {
    const p = candidatePolygons[i]
    p.polygon = await loadPolygon(p.tz, p.i)
  }

  // if some could not be loaded, delete those
  const matches = candidatePolygons
    .filter(p => p.polygon)
    .filter(p => {
      return pointInPolygon(p.polygon, point) < 1
    })

  if (matches.length) {
    return decodeURIComponent(matches[0].tz)
  }

  return null
}


export async function getLocalTimeInfo(point, date = new Date()) {
  const datePlusOneDay = new Date()
  datePlusOneDay.setUTCDate(date.getUTCDate() + 1)
  const dateMinusOneDay = new Date()
  dateMinusOneDay.setUTCDate(date.getUTCDate() - 1)

  const tz = await getTimezoneId(point)
  const datetimeFormatter = new Intl.DateTimeFormat('eo', {timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZoneName: 'short'})
  const datetime = datetimeFormatter.format(date)
  const sunTimes = SunCalc.getTimes(date, point[1], point[0])

  Object.keys(sunTimes).forEach(k => {
    if (sunTimes[k] instanceof Date) {
      sunTimes[k] = datetimeFormatter.format(sunTimes[k])
    }
  })

  const sunTimesMinus = SunCalc.getTimes(dateMinusOneDay, point[1], point[0])

  Object.keys(sunTimesMinus).forEach(k => {
    if (sunTimesMinus[k] instanceof Date) {
      sunTimesMinus[k] = datetimeFormatter.format(sunTimesMinus[k])
    }
  })

  const sunTimesPlus = SunCalc.getTimes(datePlusOneDay, point[1], point[0])

  Object.keys(datePlusOneDay).forEach(k => {
    if (datePlusOneDay[k] instanceof Date) {
      datePlusOneDay[k] = datetimeFormatter.format(datePlusOneDay[k])
    }
  })
  
  const moonTimes = SunCalc.getMoonTimes(date, point[1], point[0])

  Object.keys(moonTimes).forEach(k => {
    if (moonTimes[k] instanceof Date) {
      moonTimes[k] = datetimeFormatter.format(moonTimes[k])
    }
  })

  const moonTimesMinus = SunCalc.getMoonTimes(dateMinusOneDay, point[1], point[0])

  Object.keys(moonTimesMinus).forEach(k => {
    if (moonTimesMinus[k] instanceof Date) {
      moonTimesMinus[k] = datetimeFormatter.format(moonTimesMinus[k])
    }
  })

  const moonTimesPlus = SunCalc.getMoonTimes(datePlusOneDay, point[1], point[0])

  Object.keys(moonTimesPlus).forEach(k => {
    if (moonTimesPlus[k] instanceof Date) {
      moonTimesPlus[k] = datetimeFormatter.format(moonTimesPlus[k])
    }
  })


  return {
    lonLat: point,
    timezone: tz,
    unixTimestamp: date.getTime() / 1000,
    localTime: datetime,
    sun: {
      previousDay: sunTimesMinus,
      currentDay: sunTimes,
      nextDay: sunTimesPlus
    },
    moon: {
      previousDay: {
        ...moonTimesMinus, 
        ...SunCalc.getMoonIllumination(dateMinusOneDay),
        ...SunCalc.getMoonPosition(dateMinusOneDay, point[1], point[0]),
      },
      currentDay: {
        ...moonTimes,
        ...SunCalc.getMoonIllumination(date),
        ...SunCalc.getMoonPosition(date, point[1], point[0]),
      },
      nextDay: {
        ...moonTimesPlus, 
        ...SunCalc.getMoonIllumination(datePlusOneDay),
        ...SunCalc.getMoonPosition(datePlusOneDay, point[1], point[0]),
      },
    }
  }
}