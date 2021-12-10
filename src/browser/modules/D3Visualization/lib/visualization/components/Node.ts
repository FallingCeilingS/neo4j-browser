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

import Graph from './graph'

type NodeProperty = { key: string; value: string; type: string }
type PropertyMap = { [key: string]: string }

export default class Node {
  id: string
  labels: string[]
  propertyList: NodeProperty[]
  propertyMap: PropertyMap
  isNode = true
  isRelationship = false

  constructor(
    id: string,
    labels: string[],
    propertyMap: PropertyMap,
    propertyTypes: Record<string, string>
  ) {
    this.id = id
    this.labels = labels
    this.propertyMap = propertyMap
    this.propertyList = (() => {
      const result = []
      for (const key of Object.keys(propertyMap || {})) {
        const value = propertyMap[key]
        const type = propertyTypes[key]
        result.push({ key, value, type })
      }
      return result
    })()
  }

  toJSON(): PropertyMap {
    return this.propertyMap
  }

  relationshipCount(graph: Graph): number {
    const rels = []
    for (const relationship of graph.getRelationships()) {
      if (relationship.source === this || relationship.target === this) {
        rels.push(relationship)
      }
    }
    return rels.length
  }
}
