/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Neo4j is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import Node from './Node'

type NodeProperty = { key: string; value: string; type: string }
type PropertyMap = { [key: string]: string }

export default class Relationship {
  id: string
  propertyList: NodeProperty[]
  propertyMap: PropertyMap
  source: Node
  target: Node
  type: string
  isNode = false
  isRelationship = true
  constructor(
    id: string,
    source: Node,
    target: Node,
    type: string,
    propertyMap: PropertyMap,
    propertyTypes: Record<string, string>
  ) {
    this.id = id
    this.source = source
    this.target = target
    this.type = type
    this.propertyMap = propertyMap
    this.propertyList = (() => {
      const result = []
      for (const key of Object.keys(this.propertyMap || {})) {
        const value = this.propertyMap[key]
        const type = propertyTypes[key]
        result.push({ key, value, type })
      }
      return result
    })()
  }

  toJSON(): PropertyMap {
    return this.propertyMap
  }

  isLoop(): boolean {
    return this.source === this.target
  }
}
