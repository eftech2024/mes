'use client'

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type GroupingState,
  type ColumnOrderState,
  type Row,
} from '@tanstack/react-table'
import { cn } from '@/lib/utils'

/* ── 공통 타입 ──────────────────────────── */
export interface ColumnMeta {
  filterOptions?: string[]
  filterValue?: string
  onFilterChange?: (v: string) => void
  className?: string
  headerClassName?: string
  hideReorder?: boolean
}

export interface DataTableProps<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  defaultSorting?: SortingState
  groupBy?: string[]
  groupByOptions?: { id: string; label: string }[]
  rowClassName?: (row: Row<T>) => string
  emptyIcon?: string
  emptyMessage?: string
  emptyAction?: { label: string; onClick: () => void }
  isFilterActive?: boolean
  filterResultCount?: number
  onResetFilter?: () => void
  className?: string
}

/* ── 컬럼 헤더 필터 팝오버 ──────────────────────────── */
function FilterPopover({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange?: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isActive = !!value && value !== '전체'

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative mt-1.5">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors',
          isActive
            ? 'border-green-300 bg-green-50 text-green-700'
            : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:text-gray-600'
        )}
      >
        <span className="truncate max-w-[72px]">{isActive ? value : '전체'}</span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={cn('shrink-0 transition-transform', open && 'rotate-180')}
        >
          <polyline points="6,9 12,15 18,9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 bg-white rounded-xl shadow-lg border border-gray-100 min-w-[120px] py-1.5 overflow-hidden">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange?.(opt); setOpen(false) }}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2',
                value === opt
                  ? 'text-green-600 font-semibold bg-green-50'
                  : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              {value === opt && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
              )}
              {value !== opt && <span className="w-3" />}
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── DataTable ──────────────────────────── */
export function DataTable<T>({
  data,
  columns: initialColumns,
  defaultSorting = [],
  groupBy: defaultGroupBy,
  groupByOptions,
  rowClassName,
  emptyIcon,
  emptyMessage = '데이터가 없습니다',
  emptyAction,
  isFilterActive = false,
  filterResultCount,
  onResetFilter,
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting)
  const [grouping, setGrouping] = useState<GroupingState>(defaultGroupBy ?? [])

  const defaultOrder = useMemo(
    () => initialColumns.map((c: any) => c.id ?? c.accessorKey ?? ''),
    [initialColumns]
  )
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(defaultOrder)

  const moveColumn = useCallback((id: string, direction: 'left' | 'right') => {
    setColumnOrder(prev => {
      const arr = [...prev]
      const idx = arr.indexOf(id)
      if (idx < 0) return prev
      const target = direction === 'left' ? idx - 1 : idx + 1
      if (target < 0 || target >= arr.length) return prev
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }, [])

  const table = useReactTable({
    data,
    columns: initialColumns,
    state: { sorting, columnOrder, grouping },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onGroupingChange: setGrouping,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(defaultGroupBy || groupByOptions ? {
      getGroupedRowModel: getGroupedRowModel(),
      getExpandedRowModel: getExpandedRowModel(),
    } : {}),
  })

  /* ── empty states ── */
  if (data.length === 0 && !isFilterActive) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm font-semibold text-gray-500 mb-3">{emptyMessage}</p>
        {emptyAction && (
          <button onClick={emptyAction.onClick} className="mt-4 text-green-600 text-sm font-semibold underline">
            {emptyAction.label}
          </button>
        )}
      </div>
    )
  }

  const rows = table.getRowModel().rows
  if (rows.length === 0 && isFilterActive) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm font-semibold text-gray-500 mb-3">조건에 맞는 항목이 없습니다</p>
        {onResetFilter && (
          <button onClick={onResetFilter} className="mt-4 text-green-600 text-sm font-semibold underline">
            필터 초기화
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden', className)}>
      {/* 그룹 선택 */}
      {groupByOptions && groupByOptions.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/50">
          <span className="text-xs font-semibold text-gray-400">그룹</span>
          <select
            value={grouping[0] ?? ''}
            onChange={e => setGrouping(e.target.value ? [e.target.value] : [])}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 font-semibold text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
          >
            <option value="">— 없음 —</option>
            {groupByOptions.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
          {grouping.length > 0 && (
            <button onClick={() => setGrouping([])} className="text-xs text-gray-400 hover:text-gray-600">초기화</button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id} className="border-b border-gray-200 bg-gray-50">
                {headerGroup.headers.map((header, hIdx) => {
                  const meta = header.column.columnDef.meta as ColumnMeta | undefined
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()
                  const isFirst = hIdx === 0
                  const isLast = hIdx === headerGroup.headers.length - 1
                  const hideReorder = meta?.hideReorder

                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'text-left px-4 py-2 select-none align-top',
                        meta?.headerClassName
                      )}
                    >
                      {/* 컬럼 제목 + 정렬 + 이동 */}
                      <div className="flex items-center gap-1 group/th">
                        <button
                          className={cn(
                            'flex items-center gap-1 font-bold text-sm transition-colors whitespace-nowrap',
                            canSort
                              ? 'cursor-pointer text-gray-600 hover:text-gray-900'
                              : 'cursor-default text-gray-600'
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!canSort}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            <span className={cn(
                              'text-xs transition-colors',
                              sorted ? 'text-green-600' : 'text-gray-300 group-hover/th:text-gray-400'
                            )}>
                              {sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '⇅'}
                            </span>
                          )}
                        </button>

                        {!hideReorder && (
                          <span className="ml-auto flex gap-px opacity-0 group-hover/th:opacity-100 transition-opacity">
                            {!isFirst && (
                              <button
                                onClick={() => moveColumn(header.id, 'left')}
                                className="text-[10px] text-gray-300 hover:text-green-600 px-0.5 leading-none"
                                title="왼쪽 이동"
                              >◀</button>
                            )}
                            {!isLast && (
                              <button
                                onClick={() => moveColumn(header.id, 'right')}
                                className="text-[10px] text-gray-300 hover:text-green-600 px-0.5 leading-none"
                                title="오른쪽 이동"
                              >▶</button>
                            )}
                          </span>
                        )}
                      </div>

                      {/* 필터 팝오버 (select → 클릭 드롭다운) */}
                      {meta?.filterOptions && (
                        <FilterPopover
                          options={meta.filterOptions}
                          value={meta.filterValue ?? '전체'}
                          onChange={meta.onFilterChange}
                        />
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {rows.map(row => {
              if (row.getIsGrouped()) {
                return (
                  <tr key={row.id} className="bg-gray-50/80 border-b border-gray-100">
                    <td colSpan={row.getVisibleCells().length} className="px-4 py-2.5">
                      <button
                        onClick={row.getToggleExpandedHandler()}
                        className="flex items-center gap-2 text-sm font-bold text-gray-700 hover:text-gray-900"
                      >
                        <span className="text-xs text-gray-400">{row.getIsExpanded() ? '▼' : '▶'}</span>
                        {String(row.groupingValue)}
                        <span className="text-xs font-normal text-gray-400">({row.subRows.length}건)</span>
                      </button>
                    </td>
                  </tr>
                )
              }

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-gray-50 hover:bg-green-50/30 transition-colors',
                    rowClassName?.(row)
                  )}
                >
                  {row.getVisibleCells().map(cell => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined
                    return (
                      <td key={cell.id} className={cn('px-4 py-3', meta?.className)}>
                        {cell.getIsGrouped()
                          ? null
                          : cell.getIsAggregated()
                            ? flexRender(cell.column.columnDef.aggregatedCell ?? cell.column.columnDef.cell, cell.getContext())
                            : flexRender(cell.column.columnDef.cell, cell.getContext())
                        }
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
