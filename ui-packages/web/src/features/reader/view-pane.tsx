import * as Tabs from '@radix-ui/react-tabs'
import { Activity } from 'react'
import { type ViewName, views } from '../../shell/view-tab'

// A view in a tab, kept mounted while hidden as documents are, so its place and input survive.
export const ViewPane = ({ id, view, active }: { id: string; view: ViewName; active: boolean }) => {
  const { Pane } = views[view]
  return (
    <Activity mode={active ? 'visible' : 'hidden'}>
      <Tabs.Content value={id} className="document-pane" forceMount>
        <div className="reader-content">
          <div className="document-scroll">
            <Pane active={active} />
          </div>
        </div>
      </Tabs.Content>
    </Activity>
  )
}
