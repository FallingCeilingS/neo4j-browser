type NodeProperty = { key: string; value: string; type: string }

type PropertyMap = { [key: string]: string }

export type Node = {
  id: string
  isNode: boolean
  isRelationship: boolean
  labels: string[]
  propertyList: NodeProperty[]
  propertyMap: PropertyMap
}
