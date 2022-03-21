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
import deepmerge from 'deepmerge'
import { debounce } from 'lodash-es'
import React, { Component } from 'react'

import { Graph } from './Graph/Graph'
import { NodeInspectorPanel, defaultPanelWidth } from './NodeInspectorPanel'
import { StyledFullSizeContainer, panelMinWidth } from './styled'
import {
  BasicNode,
  BasicNodesAndRels,
  BasicRelationship,
  deepEquals
} from 'neo4j-arc/common'
import { DetailsPaneProps } from './DefaultPanelContent/DefaultDetailsPane'
import { OverviewPaneProps } from './DefaultPanelContent/DefaultOverviewPane'
import { GraphStyleModel } from '../models/GraphStyle'
import { GraphStats } from '../utils/mapper'
import { GraphModel } from '../models/Graph'
import { GraphCanvas } from './GraphCanvas'
import { ExpandNodeHandler, VItem } from '../types'

type DeduplicateHelper = {
  nodes: BasicNode[]
  taken: Record<string, boolean>
  nodeLimitHit: boolean
}

const DEFAULT_INITIAL_NODE_DISPLAY = 300
const DEFAULT_MAX_NEIGHBOURS = 100

const deduplicateNodes = (
  nodes: BasicNode[],
  limit: number
): { nodes: BasicNode[]; nodeLimitHit: boolean } =>
  nodes.reduce(
    (all: DeduplicateHelper, curr: BasicNode) => {
      if (all.nodes.length === limit) {
        all.nodeLimitHit = true
      } else if (!all.taken[curr.id]) {
        all.nodes.push(curr)
        all.taken[curr.id] = true
      }
      return all
    },
    { nodes: [], taken: {}, nodeLimitHit: false }
  )

type GraphVisualizerDefaultProps = {
  initialNodeDisplay: number
  maxNeighbours: number
  updateStyle: (style: any) => void
  isFullscreen: boolean
  assignVisElement: (svgElement: any, graphElement: any) => void
  getAutoCompleteCallback: (
    callback: (rels: BasicRelationship[]) => void
  ) => void
  setGraph: (graph: GraphModel) => void
  hasTruncatedFields: boolean
  nodePropertiesExpandedByDefault: boolean
  setNodePropertiesExpandedByDefault: (expandedByDefault: boolean) => void
  wheelZoomInfoMessageEnabled: boolean
  disableWheelZoomInfoMessage: () => void
}
type GraphVisualizerProps = GraphVisualizerDefaultProps & {
  relationships: BasicRelationship[]
  nodes: BasicNode[]
  initialNodeDisplay?: number
  maxNeighbours?: number
  graphStyleData?: any
  getNeighbours?: (
    id: string,
    currentNeighbourIds: string[] | undefined
  ) => Promise<BasicNodesAndRels & { allNeighboursCount: number }>
  updateStyle?: (style: any) => void
  isFullscreen?: boolean
  assignVisElement?: (svgElement: any, graphElement: any) => void
  getAutoCompleteCallback?: (
    callback: (rels: BasicRelationship[]) => void
  ) => void
  setGraph?: (graph: GraphModel) => void
  hasTruncatedFields?: boolean
  nodePropertiesExpandedByDefault?: boolean
  setNodePropertiesExpandedByDefault?: (expandedByDefault: boolean) => void
  wheelZoomInfoMessageEnabled?: boolean
  disableWheelZoomInfoMessage?: () => void
  DetailsPaneOverride?: React.FC<DetailsPaneProps>
  OverviewPaneOverride?: React.FC<OverviewPaneProps>
}

type GraphVisualizerState = {
  graphStyle: GraphStyleModel
  hoveredItem: VItem
  nodes: BasicNode[]
  relationships: BasicRelationship[]
  selectedItem: VItem
  stats: GraphStats
  styleVersion: number
  freezeLegend: boolean
  width: number
  nodePropertiesExpanded: boolean
}

export class GraphVisualizer extends Component<
  GraphVisualizerProps,
  GraphVisualizerState
> {
  defaultStyle: Record<string, Record<string, string>>

  static defaultProps: GraphVisualizerDefaultProps = {
    initialNodeDisplay: DEFAULT_INITIAL_NODE_DISPLAY,
    maxNeighbours: DEFAULT_MAX_NEIGHBOURS,
    updateStyle: () => undefined,
    isFullscreen: false,
    assignVisElement: () => undefined,
    getAutoCompleteCallback: () => undefined,
    setGraph: () => undefined,
    hasTruncatedFields: false,
    nodePropertiesExpandedByDefault: true,
    setNodePropertiesExpandedByDefault: () => undefined,
    wheelZoomInfoMessageEnabled: false,
    disableWheelZoomInfoMessage: () => undefined
  }

  constructor(props: GraphVisualizerProps) {
    super(props)
    const graphStyle = new GraphStyleModel()
    this.defaultStyle = graphStyle.toSheet()
    const { nodes, nodeLimitHit } = deduplicateNodes(
      this.props.nodes,
      this.props.initialNodeDisplay
    )
    const relationships = nodeLimitHit
      ? this.props.relationships.filter(
          rel =>
            !!nodes.find(node => node.id === rel.startNodeId) &&
            !!nodes.find(node => node.id === rel.endNodeId)
        )
      : this.props.relationships

    const selectedItem: VItem = nodeLimitHit
      ? {
          type: 'status-item',
          item: `Not all return nodes are being displayed due to Initial Node Display setting. Only ${this.props.initialNodeDisplay} of ${this.props.nodes.length} nodes are being displayed`
        }
      : {
          type: 'canvas',
          item: {
            nodeCount: nodes.length,
            relationshipCount: relationships.length
          }
        }

    if (this.props.graphStyleData) {
      const rebasedStyle = deepmerge(
        this.defaultStyle,
        this.props.graphStyleData
      )
      graphStyle.loadRules(rebasedStyle)
    }
    this.state = {
      stats: {
        labels: {},
        relTypes: {}
      },
      graphStyle,
      styleVersion: 0,
      nodes,
      relationships,
      selectedItem,
      hoveredItem: selectedItem,
      freezeLegend: false,
      width: defaultPanelWidth(),
      nodePropertiesExpanded: this.props.nodePropertiesExpandedByDefault
    }
  }

  getNodeNeighbours: ExpandNodeHandler = (
    node,
    currentNeighbourIds,
    callback
  ) => {
    if (currentNeighbourIds.length > this.props.maxNeighbours) {
      callback({ nodes: [], relationships: [] })
    }
    if (this.props.getNeighbours) {
      this.props.getNeighbours(node.id, currentNeighbourIds).then(
        ({ nodes, relationships, allNeighboursCount }) => {
          if (allNeighboursCount > this.props.maxNeighbours) {
            this.setState({
              selectedItem: {
                type: 'status-item',
                item: `Rendering was limited to ${this.props.maxNeighbours} of the node's total ${allNeighboursCount} neighbours due to browser config maxNeighbours.`
              }
            })
          }
          callback({ nodes, relationships })
        },
        () => {
          callback({ nodes: [], relationships: [] })
        }
      )
    }
  }

  onItemMouseOver(item: VItem): void {
    console.log('item', item)
    this.setHoveredItem(item)
  }

  mounted = true
  setHoveredItem = debounce((hoveredItem: VItem) => {
    if (this.mounted) {
      this.setState({ hoveredItem })
    }
  }, 200)

  onItemSelect(selectedItem: VItem): void {
    this.setState({ selectedItem })
  }

  onGraphModelChange(stats: GraphStats): void {
    this.setState({ stats })
    if (this.props.updateStyle) {
      this.props.updateStyle(this.state.graphStyle.toSheet())
    }
  }

  componentDidUpdate(prevProps: GraphVisualizerProps): void {
    if (!deepEquals(prevProps.graphStyleData, this.props.graphStyleData)) {
      console.log('comp should update')
      if (this.props.graphStyleData) {
        const rebasedStyle = deepmerge(
          this.defaultStyle,
          this.props.graphStyleData
        )
        this.state.graphStyle.loadRules(rebasedStyle)
        this.setState({
          graphStyle: this.state.graphStyle,
          styleVersion: this.state.styleVersion + 1
        })
      } else {
        this.state.graphStyle.resetToDefault()
        this.setState(
          { graphStyle: this.state.graphStyle, freezeLegend: true },
          () => {
            this.setState({ freezeLegend: false })
            this.props.updateStyle(this.state.graphStyle.toSheet())
          }
        )
      }
    }
  }

  render(): JSX.Element {
    // This is a workaround to make the style reset to the same colors as when starting the browser with an empty style
    // If the legend component has the style it will ask the neoGraphStyle object for styling before the graph component,
    // and also doing this in a different order from the graph. This leads to different default colors being assigned to different labels.
    const graphStyle = this.state.freezeLegend
      ? new GraphStyleModel()
      : this.state.graphStyle

    const renderCanvas = true

    return (
      <StyledFullSizeContainer id="svg-vis">
        {renderCanvas ? (
          <GraphCanvas
            isFullscreen={this.props.isFullscreen}
            nodes={this.state.nodes}
            relationships={this.state.relationships}
            styleVersion={this.state.styleVersion}
            style={graphStyle}
            setGraphModel={this.props.setGraph}
            autoCompleteRelationships={this.props.getAutoCompleteCallback}
            onItemSelect={this.onItemSelect.bind(this)}
            onItemMouseOver={this.onItemMouseOver.bind(this)}
            onExpandNode={this.getNodeNeighbours.bind(this)}
            onGraphModelChange={this.onGraphModelChange.bind(this)}
            controlButtonOffset={
              (this.state.nodePropertiesExpanded ? this.state.width : 0) + 8
            }
            wheelZoomInfoMessageEnabled={this.props.wheelZoomInfoMessageEnabled}
            disableWheelZoomInfoMessage={this.props.disableWheelZoomInfoMessage}
          />
        ) : (
          <Graph
            isFullscreen={this.props.isFullscreen}
            relationships={this.state.relationships}
            nodes={this.state.nodes}
            getNodeNeighbours={this.getNodeNeighbours.bind(this)}
            onItemMouseOver={this.onItemMouseOver.bind(this)}
            onItemSelect={this.onItemSelect.bind(this)}
            graphStyle={graphStyle}
            styleVersion={this.state.styleVersion} // cheap way for child to check style updates
            onGraphModelChange={this.onGraphModelChange.bind(this)}
            assignVisElement={this.props.assignVisElement}
            getAutoCompleteCallback={this.props.getAutoCompleteCallback}
            setGraph={this.props.setGraph}
            offset={
              (this.state.nodePropertiesExpanded ? this.state.width : 0) + 8
            }
            wheelZoomInfoMessageEnabled={this.props.wheelZoomInfoMessageEnabled}
            disableWheelZoomInfoMessage={this.props.disableWheelZoomInfoMessage}
          />
        )}
        <NodeInspectorPanel
          graphStyle={graphStyle}
          hasTruncatedFields={this.props.hasTruncatedFields}
          hoveredItem={this.state.hoveredItem}
          selectedItem={this.state.selectedItem}
          stats={this.state.stats}
          width={this.state.width}
          setWidth={(width: number) =>
            this.setState({ width: Math.max(panelMinWidth, width) })
          }
          expanded={this.state.nodePropertiesExpanded}
          toggleExpanded={() => {
            const { nodePropertiesExpanded } = this.state
            this.props.setNodePropertiesExpandedByDefault(
              !nodePropertiesExpanded
            )
            this.setState({ nodePropertiesExpanded: !nodePropertiesExpanded })
          }}
          DetailsPaneOverride={this.props.DetailsPaneOverride}
          OverviewPaneOverride={this.props.OverviewPaneOverride}
        />
      </StyledFullSizeContainer>
    )
  }

  componentWillUnmount(): void {
    this.mounted = false
  }
}
