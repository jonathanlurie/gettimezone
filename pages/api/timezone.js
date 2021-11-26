import { getTimezoneId, getLocalTimeInfo } from '../../src/backend'



export default async function handler(req, res) {
  if (!('lon' in req.query) || !('lat' in req.query)) {
    return res.status(400).json({ data: null, error: "The param 'lat' and 'lon' are required." })
  }

  let data = null

  try {
    const date = 'timestamp' in req.query ? new Date(parseFloat(req.query.timestamp) * 1000) : new Date()
    data = await getLocalTimeInfo([parseFloat(req.query.lon), parseFloat(req.query.lat)], date)
  } catch(e) {
    return res.status(400).json({ data: null, error: e.message })
  }

  res.status(200).json({ data, error: null })
}
