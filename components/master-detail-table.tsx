'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface MasterDetailColumn<T> {
  id: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  headerClassName?: string
}

export interface MasterDetailTab<T> {
  id: string
  label: string
  render: (row: T) => ReactNode
}

interface MasterDetailTableProps<T> {
  data: T[]
  columns: MasterDetailColumn<T>[]
  getRowId: (row: T) => string
  detailTabs: MasterDetailTab<T>[]
  detailTitle: (row: T) => ReactNode
  detailSubtitle?: (row: T) => ReactNode
  emptyMessage?: string
  detailEmptyTitle?: string
  detailEmptyMessage?: string
  onEdit?: (row: T) => void
  onDelete?: (row: T) => void
  rowClassName?: (row: T, selected: boolean) => string
  selectedId?: string | null
  onSelectedIdChange?: (id: string | null) => void
}

export function MasterDetailTable<T>({
  data,
  columns,
  getRowId,
  detailTabs,
  detailTitle,
  detailSubtitle,
  emptyMessage = '표시할 데이터가 없습니다.',
  detailEmptyTitle = '행을 선택하세요',
  detailEmptyMessage = '좌측 목록에서 행을 클릭하면 상세 정보와 액션이 우측 패널에 표시됩니다.',
  onEdit,
  onDelete,
  rowClassName,
  selectedId,
  onSelectedIdChange,
}: MasterDetailTableProps<T>) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)

  const activeSelectedId = selectedId !== undefined ? selectedId : internalSelectedId
  const setSelectedId = (nextId: string | null) => {
    if (selectedId === undefined) setInternalSelectedId(nextId)
    onSelectedIdChange?.(nextId)
  }

  useEffect(() => {
    if (data.length === 0) {
      setSelectedId(null)
      return
    }

    const hasSelected = activeSelectedId && data.some(row => getRowId(row) === activeSelectedId)
    if (!hasSelected) setSelectedId(getRowId(data[0]))
  }, [activeSelectedId, data, getRowId])

  const selectedRow = useMemo(
    () => data.find(row => getRowId(row) === activeSelectedId) ?? null,
    [activeSelectedId, data, getRowId]
  )

  const hasActions = Boolean(onEdit || onDelete)
  const defaultTab = detailTabs[0]?.id ?? 'detail'

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {columns.map(column => (
                  <th
                    key={column.id}
                    className={cn('px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500', column.headerClassName)}
                  >
                    {column.header}
                  </th>
                ))}
                {hasActions && <th className="w-28 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">액션</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (hasActions ? 1 : 0)} className="px-4 py-12 text-center text-gray-400">
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {data.map(row => {
                const rowId = getRowId(row)
                const selected = rowId === activeSelectedId

                return (
                  <tr
                    key={rowId}
                    onClick={() => setSelectedId(rowId)}
                    className={cn(
                      'cursor-pointer align-top transition-colors hover:bg-gray-50',
                      selected && 'bg-emerald-50/70',
                      rowClassName?.(row, selected)
                    )}
                  >
                    {columns.map(column => (
                      <td key={column.id} className={cn('px-4 py-3', column.className)}>
                        {column.render(row)}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {onEdit && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedId(rowId)
                                onEdit(row)
                              }}
                            >
                              수정
                            </Button>
                          )}
                          {onDelete && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                setSelectedId(rowId)
                                onDelete(row)
                              }}
                              className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                            >
                              삭제
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="min-h-[240px] rounded-2xl border border-gray-200 bg-white shadow-sm xl:sticky xl:top-6">
        {!selectedRow && (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold text-gray-700">{detailEmptyTitle}</p>
            <p className="mt-2 text-sm text-gray-400">{detailEmptyMessage}</p>
          </div>
        )}

        {selectedRow && (
          <div className="p-4">
            <div className="border-b border-gray-100 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-gray-900">{detailTitle(selectedRow)}</div>
                  {detailSubtitle && <div className="mt-1 text-sm text-gray-500">{detailSubtitle(selectedRow)}</div>}
                </div>
                <div className="flex gap-2">
                  {onEdit && <Button type="button" variant="outline" size="sm" onClick={() => onEdit(selectedRow)}>수정</Button>}
                  {onDelete && (
                    <button type="button" onClick={() => onDelete(selectedRow)} className="rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50">
                      삭제
                    </button>
                  )}
                </div>
              </div>
            </div>

            <Tabs key={getRowId(selectedRow)} defaultValue={defaultTab} className="mt-4">
              <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${detailTabs.length}, minmax(0, 1fr))` }}>
                {detailTabs.map(tab => (
                  <TabsTrigger key={tab.id} value={tab.id}>{tab.label}</TabsTrigger>
                ))}
              </TabsList>
              {detailTabs.map(tab => (
                <TabsContent key={tab.id} value={tab.id} className="mt-4">
                  {tab.render(selectedRow)}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}