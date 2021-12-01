import Head from 'next/head'
import React from 'react'
import styles from '../styles/Home.module.css'
import * as topojson from "topojson-client"
import { getAllPolygons, getLocalTimeInfo } from '../src/frontend'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

function polygon(points, options = {}) {
  const strokeWidth = 'strokeWidth' in options? options.strokeWidth : 0.1
  const strokeColor = 'strokeColor' in options ? options.strokeColor : '#000000'
  const opacity = 'opacity' in options ? options.opacity : 1
  const fillColor = 'fillColor' in options ? options.fillColor : '#ffffff'
  const holes = 'holes' in options ? options.holes : null
  const polygonGroup = document.createElementNS(SVG_NAMESPACE, 'g')
  const polygonPath = document.createElementNS(SVG_NAMESPACE, 'path')

  let pointsStr = 'M '
  for (let i = 0; i < points.length; i += 1) {
    pointsStr += `${points[i][0]} ${points[i][1]} `
  }
  pointsStr += ' Z '

  // punching some holes in the polygon
  if(holes && Array.isArray(holes)) {
    for (let holeIndex = 0; holeIndex < holes.length; holeIndex += 1) {
      const holePolygon = holes[holeIndex]

      let holePointsStr = ' M '
      for (let i = 0; i < holePolygon.length; i += 1) {
        holePointsStr += `${holePolygon[i][0]} ${holePolygon[i][1]} `
      }
      holePointsStr += ' Z ' 
    }

    // console.log(polygonPath);
    pointsStr += holePointsStr
  }

  polygonPath.setAttributeNS(null, 'd', pointsStr)
  polygonPath.setAttributeNS(null, 'fill-rule', 'evenodd')
  polygonGroup.setAttributeNS(null, 'style', `fill: ${fillColor}; opacity: ${opacity}; stroke-width: ${strokeWidth}; stroke: ${strokeColor}`)
  polygonGroup.appendChild(polygonPath)
  return polygonGroup
}


function deg2rad(deg) {
  return deg * (Math.PI / 180)
}


function rad2deg(rad) {
  return rad * 180 / Math.PI
}


function equirectangularProjectionForward(lonLat, options = {}) {
  // longitude in [-180, +180] deg or [-PI, +PI] radian
  // const lambdaZero = deg2rad('lambdaZero' in options ? options.lambdaZero : 0)
  // latitude in [-90, +90] deg or [-PI/2, +PI/2]
  // const phiZero = deg2rad('phiZero' in options ? options.phiZero : 0)
  const screenFactor = 'screenFactor' in options ? options.screenFactor : 1000

  const screenCoords = []

  for (let i = 0; i < lonLat.length ; i += 1) {
    const lon = lonLat[i][0]
    const lat = lonLat[i][1]
    const lambda = deg2rad(lon)
    const phi = deg2rad(lat)
    // const x = Math.cos(phiZero) * (lambda - lambdaZero)
    // const y = (phiZero - phi)

    // simple case when phiZero and lambdaZero are both 0
    const x = lambda
    const y = phi

    // on scale to the svg:
    const xSvg = ((x + Math.PI) / (2 * Math.PI)) * screenFactor
    const ySvg = screenFactor / 4 - (y / (2 * Math.PI)) * screenFactor

    screenCoords.push([xSvg, ySvg])
  }

  return screenCoords
}


function equirectangularProjectionReverse(xySvg, options = {}) {
  const screenFactor = 'screenFactor' in options ? options.screenFactor : 1000
  const xSvg = xySvg[0]
  const ySVG = xySvg[1]
  const x = (xSvg * 2 * Math.PI) / screenFactor - Math.PI
  const y = 2 * Math.PI * (-ySVG/screenFactor + 0.25)
  const lon = rad2deg(x)
  const lat = rad2deg(y)
  return [lon, lat]
} 


export default class Home extends React.Component {
  constructor(props) {
    super(props)
    this._svgContainer = React.createRef()
    this._canvas = null

    this.state = {
      tzInfo: '',
      lonLat: '',
      lookupTime: 0,
    }
  }

  componentDidMount() {
    const ps = getAllPolygons()
    console.log(ps)
    this.init()
  }


  async init() {
    
    const mapRes = await fetch('countries-land-10km.geo.json')
    const mapTopo = await mapRes.json()
    console.log(mapTopo);

    const geojsonCountries = mapTopo // topojson.feature(mapTopo, mapTopo.objects.countries)
    console.log(geojsonCountries)

    // drawing the polygons
    const width = 1000
    const height = 500
    const background = '#0f014e'
    const parentDiv = document.getElementById('container')
    const canvas = document.createElementNS(SVG_NAMESPACE, 'svg')
    this._canvas = canvas
    canvas.setAttribute('height', `${height}`)
    canvas.setAttribute('width', `${width}`)
    canvas.setAttribute('style', `background-color: ${background};`)
    canvas.setAttribute('viewBox', `0 0 ${width} ${height}`)
    this._svgContainer.current.appendChild(canvas)

    for (let i = 0; i < geojsonCountries.features.length; i += 1) {
      const country = geojsonCountries.features[i]
      const geometry = country.geometry
      const id = country.properties.A3
      const geometryType = geometry.type
  
      // let them all have the same shape (array of array of array)
      const allPolygons = geometryType === 'MultiPolygon' ? geometry : [geometry]

      const countryColor = `hsl(${Math.random() * 360}, ${50 + Math.random() * 50}%, ${50 + Math.random() * 35}%)`
  
      if (geometryType === 'MultiPolygon') {
        geometry.coordinates.forEach((el, i) => {
          const sumplifiedPoly = el[0] //simplify(el[0])
          let holes = el.length > 1 ? el.slice(1).map(hp => equirectangularProjectionForward(hp)) : null
          const xyArr = equirectangularProjectionForward(sumplifiedPoly)
          const p = polygon(xyArr, {
            fillColor: countryColor,
            strokeWidth: 0,
            holes,
          })
          p.id = `${id} ${i}`
          canvas.appendChild(p)
        })
  
      } else if (geometryType === 'Polygon') {
        const el = geometry.coordinates[0]
        const holes = geometry.coordinates.length > 1 ? geometry.coordinates.slice(1).map(hp => equirectangularProjectionForward(hp)) : null
        const sumplifiedPoly = el // simplify(el)
        const xyArr = equirectangularProjectionForward(sumplifiedPoly)
        const p = polygon(xyArr, {
          fillColor: countryColor,
          strokeWidth: 0,
          holes,
        })
        p.id = id
        canvas.appendChild(p)
      }
    }

    canvas.addEventListener('mousedown', async (evt) => {
      const lonLat = equirectangularProjectionReverse([evt.layerX, evt.layerY])
      const tzInfo = getLocalTimeInfo(lonLat)
      this.setState({tzInfo: JSON.stringify(tzInfo, null, 2)})
    })

    canvas.addEventListener('mousemove', async (evt) => {
      const lonLat = equirectangularProjectionReverse([evt.layerX, evt.layerY])
      const t0 = performance.now()
      const tzInfo = getLocalTimeInfo(lonLat)
      const t1 = performance.now()
      this.setState({lonLat, tzInfo: JSON.stringify(tzInfo, null, 2), lookupTime: t1 - t0})
    })
  }

  render() {
    return (
      <div className={styles.container}>
        <Head>
          <title>Create Next App</title>
          <meta name="description" content="Generated by create next app" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <div
          style={{
            display: 'inline-grid',
          }}
        >
        <div ref={this._svgContainer} />
        
        <textarea 
          style={{
            textAlign: 'center'
          }}
          value={`lon: ${this.state.lonLat[0]}   lat: ${this.state.lonLat[1]}   (lookup time: ${this.state.lookupTime.toFixed(3)}ms)`}>
        </textarea>

        <textarea 
          style={{
            width: 1000,
            height: 400,
          }}
          value={this.state.tzInfo}>
        </textarea>
        </div>


       

      </div>
    )
  }
}