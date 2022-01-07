// Defines the `FlexGrid` class - used primarily for displaying photo albums.

// A dynamic grid layout class
//
// This has a number of guarantees and features, particularly that:
//  1. Items are always displayed in the same order (relative to left-to-right, top-to-bottom),
//  2. Items may have arbitrary "true" dimensions, and will be scaled to fit, and
//  3. Items can be displayed across multiple columns, slightly cropping others to align them
//     (within a specified bound). These are generally called "multi-column items".
//
// As might already be apparent, this requires a decent amount of complexity to get right.
class FlexGrid {
    // The containing div for the FlexGrid
    _container;

    // Required minimum number of columns
    _minColumns;
    // Maximum allowed number of columns
    _maxColumns;
    // Minimum width for a single column, in pixels
    _minColumnWidth;
    // Current width of each column, in pixels
    _columnWidth;

    // Maximum allowed height for items spanning multiple columns, as a multiple of the width of a
    // single column
    //
    // Setting this to zero will disable multi-column items.
    _maxMultiColumnHeightMultiplier;

    // Maximum allowed number of multi-column images that can be placed over the same columns in a
    // row
    //
    // Must be > 0
    _maxSequentialMulti;

    // Maximum allowed cropping of a single dimension (either height or width) in order to create
    // multi-column items.
    _maxColumnCrop;

    // Maximum allowed cropping *of* multi-column items in order to get them to fit within the
    // `max_multi_column_height_multiplier` bound.
    _maxMultiCrop;

    // Amount of blank space to leave between items, in pixels
    _padding;

    // All of the elements to be displayed in the grid, in order from top to bottom
    //
    // this must have type:
    //
    //     [{ element: Element, dims: { width: int, height: int } }]
    _items;

    // Generated information about each column
    //
    // This *might* not contain all of the items; sometimes we join two columns together in a single
    // image - in which case we reset 'items' and 'height', and update 'yBase' accordingly. The
    // actual total height of a column can therefore be retrieved with 'yBase + height'.
    //
    // This should have type:
    //
    //     [{
    //         yBase: int,
    //         height: int,
    //         after: { start: int, numCols: int, seqCount: int }?,
    //         items: [{ element: Element, dims: { width: int, height: int }}]
    //     }]
    //
    // where height gives the height of all of the items in this section of the column, including
    // trailing padding, and 'yBase' gives the vertical offset before they start -- including any
    // padding from previous items.
    //
    // 'after' gives the range of the multi-column item that the column is now building on top of,
    // if there is one. The seqCount sub-field gives the number of multi-column items with this
    // exact range stacked on top of each other, so that we can stay below _maxSequentialMulti.
    //
    // Note: the objects giving 'after' are directly shared between columms; we only need to
    // increment seqCount on one of them to update all shared 'after' values.
    _columns;

    // Current calculated total height of the grid
    _totalHeight;

    // Constructs a new FlexGrid, given the container to place items into, and a number of
    // configuration parameters
    //
    // The configuration should have the following type:
    //
    //    {
    //        minColumns: int,
    //        maxColumns: int,
    //        minColumnWidth: int,
    //        padding: int,
    //        maxColumnCrop: float,
    //        maxMultiCrop: float,
    //        maxMultiColumnHeightMultiplier: float,
    //        maxSequentialMulti: int,
    //    }
    //
    // minColumnWidth is in pixels. maxColumnCrop specifies the maxmium fraction of a single element
    // dimension that we're allowed to crop in order to make multi-column items -- with maxMultiCrop
    // giving the cropping allowed for those multi-column items to fit the bound by
    // maxMultiColumnHeightMultiplier, which specifies the maximum height of a multi-column item, as
    // a multiple of the current column width.
    //
    // maxSequentialMulti specifies the maximum number of times that multi-column items can be
    // layered over the same set of columns in a row.
    //
    // Each provided value in `initialItems` must be an object with type:
    //
    //     { element: Element, dims: { width: int, height: int } }
    //
    // Each provided element must be tagged with the additional data `dims`, a JSON object with type
    // `{ height: int, width: int }`; it should give the "true" size of the box
    //
    // There is no difference in performance between adding elements in `initialItems` vs adding
    // them one-by-one with `addItemWithDims`; the latter is provided here only for your convenience.
    constructor(container, initialItems, config) {
        let {
            minColumns, maxColumns, minColumnWidth, padding, maxColumnCrop, maxMultiCrop,
            maxMultiColumnHeightMultiplier, maxSequentialMulti
        } = config

        this._container = container
        this._minColumns = minColumns
        this._maxColumns = maxColumns
        this._minColumnWidth = minColumnWidth
        this._maxColumnCrop = maxColumnCrop
        this._maxMultiCrop = maxMultiCrop
        this._maxMultiColumnHeightMultiplier = maxMultiColumnHeightMultiplier
        this._maxSequentialMulti = maxSequentialMulti
        this._padding = padding

        this._columnWidth = 0
        this._items = initialItems
        this._columns = []
        this._totalHeight = 0
        this._width = 0

        this.rescale();
    }

    // Changes the minColumnWidth to the new value and updates the displayed contents accordingly
    setMinColumnWidth(newMin) {
        if (this._minColumnWidth !== newMin) {
            this._minColumnWidth = newMin
            let { numCols, colWidth } = this._calculateColumnSizing(this._width)
            if (colWidth !== this._columnWidth) {
                this._forceRescale(numCols, colWidth)
            }
        }

    }

    // Resizes (or: initially sizes) the FlexGrid
    rescale() {
        let width = this._container.clientWidth;
        
        if (this._width == width) {
            return
        }

        let { numCols, colWidth } = this._calculateColumnSizing(width)
        this._width = width

        this._forceRescale(numCols, colWidth)
    }

    // Like rescale(), always recalculates & uses the given column info
    _forceRescale(numCols, colWidth) {
        this._columns = Array.apply(null, Array(numCols)).map(() => ({ yBase: 0, height: 0, items: [] }))

        this._columnWidth = colWidth
        this._totalHeight = 0

        let items = this._items
        this._items = []
        
        for (let item of items) {
            this.addItemWithDims(item.element, item.dims);
        }
    }

    _calculateColumnSizing(width) {
        // The formula for this is probably a little bit tricky. Doing it in a loop is simple,
        // although probably not as "clean"
        for (let numCols = this._maxColumns; numCols >= this._minColumns; numCols--) {
            let w = width - (numCols !== 0) * this._padding * (numCols - 1)

            let colWidth = w / numCols
            if (colWidth >= this._minColumnWidth || (colWidth > 0 && numCols == this._minColumns)) {
                return { numCols, colWidth }
            }
        }

        throw `failed to calculate column sizing; no valid combination with padding`
    }

    // Adds the element with given dimensions to the FlexGrid, provided its dimensions
    //
    // The dimensions `dims` must have the following type:
    //
    //    {
    //        height: int,
    //        width: int,
    //    }
    addItemWithDims(element, dims) {
        let { col, numCols, cropHeight } = this._getLargestColumnRange(dims)
        
        // If we're making this a multi-column item, we might need to stretch the component columns
        if (numCols > 1) {
            for (let i = 0; i < numCols; i++) {
                let c = col + i

                this._cropColumnToHeight(c, cropHeight)
            }
        }

        // Find the x & y coordinates of the new item
        let x = this._columnWidth * col + (col !== 0) * this._padding * col
        let y = this._columns[col].yBase + this._columns[col].height

        // And then calculate the height & width:

        let itemWidth = this._columnWidth * numCols + this._padding * (numCols - 1)
        let itemHeight = dims.height * (itemWidth / dims.width)

        // Special case for cropped multi-column items; only required if the item wouldn't normally
        // fit within maxMultiColumnHeightMultiplier:
        if (numCols > 1) {
            let maxHeight = this._columnWidth * this._maxMultiColumnHeightMultiplier
            itemHeight = Math.min(itemHeight, maxHeight)
        }

        // Appropriately position the item
        this._setItemAttrs(element, x, y, itemWidth, itemHeight)
        this._items.push({ element, dims })

        // And... update the column(s)
        if (numCols === 1) {
            this._columns[col].items.push({ element, dims })
            this._columns[col].height += itemHeight + this._padding
        } else {
            let resetHeight = y + itemHeight + this._padding

            for (let c of this._columns.slice(col, col + numCols)) {
                c.yBase = resetHeight
                c.height = 0
                c.items = []
            }

            let c = this._columns[col]
            if (c.after && c.after.start === col && c.after.numCols === numCols) {
                c.after.seqCount += 1
            } else {
                let after = { start: col, numCols, seqCount: 1 }

                for (let c of this._columns.slice(col, col + numCols)) {
                    // Share the object so that everything can be updated at once (like above)
                    c.after = after
                }
            }
        }

        // Finally, scale the height of the container so that it'll include element
        this._totalHeight = Math.max(this._totalHeight, this._columns[col].yBase + this._columns[col].height)
        this._container.style.height = `${this._totalHeight}px`
    }

    // Returns the largest range of columns we can put an item with the given dimensions into,
    // provided that it cannot leave empty space further up the page (i.e. it must include the
    // shortest column)
    //
    // Returns an object with type:
    //
    //     {
    //         col: int,
    //         numCols: int,
    //         cropHeight: float
    //     }
    //
    // where cropHeight indicates the height to crop all of the columns to, if numCols > 1.
    _getLargestColumnRange(dims) {
        // First, find the theoretical maximum nuber of columns we could expand this into.
        //
        // The maximum number of columns that *this* item can use is determinable only by its aspect
        // ratio -- we do want to include the ability to crop it to fit, though - just to add a
        // little bit of extra wiggle-room with these wider items.
        let itemMaxCols = Math.trunc(
            this._maxMultiColumnHeightMultiplier / (dims.height / dims.width * (1 - this._maxMultiCrop))
        )
        itemMaxCols = Math.max(Math.min(itemMaxCols, this._columns.length), 1)

        // TODO: This algorithm has a somewhat-poor algorithmic complexity (polynomial in the number
        // of columns). For my use-case, this doesn't really matter, but it might be useful to
        // eventually make this better.

        // For each column, determine the maximum number of columns a multi-column item starting
        // in it could take up *while* guaranteeing that the height is less than or equal to all
        // columns not included (equal is allowed if they are to the right).
        //
        // All but one column will fail to have a solution, so we just return any solution we find.
        // We're guaranteed to have at least the solution of a single-column item at the column with
        // the shortest height.
        //
        // Obviously, this is a little complicated. There's a lot of constraints here; I'll try to
        // walk you through as best I can.
        let cropRanges = this._columns.map((_, index) => this._columnCropRange(index))

        // Optimization:
        // 
        // Find the column that has the smallest ending crop range -- if a column we're looking at
        // starts after that end, then it cannot use any cropping to fit all of the other columns.
        let minEnd = Math.min(cropRanges.map(r => r.end))

        for (let col = 0; col < this._columns.length; col++) {
            // The maximum number of columns we've found a valid solution with -- so far. Equal to
            // zero if there is none.
            let maxNumCols = 0
            let heightOfValid = null

            let cropRange = { start: cropRanges[col].start, end: cropRanges[col].end }
            
            // See note above; not possible to construct a valid pair
            if (cropRange.start > minEnd) {
                continue;
            }

            for (let numCols = 1; numCols <= itemMaxCols && col + numCols <= this._columns.length; numCols++) {
                if (numCols !== 1) {
                    // Check if this column can be stretched to be included:
                    let range = this._columnCropRange(col + numCols - 1)
                    cropRange.start = Math.max(range.start, cropRange.start)
                    cropRange.end = Math.min(range.end, cropRange.end)
                }

                // Create a temporary copy of the cropRange, so that we can check if this would be a
                // valid solution (by reducing the end of the range with height of each column
                // currently left out of the item)
                let tempRange = { start: cropRange.start, end: cropRange.end }

                // Check if there's any columns *not* included here that are currently positioned
                // lower than this range would allow -- and if not, then bound the solution by those
                // other columns.
                //
                // TODO: we could cache certain ranges of this, only repeating over the sections
                // within range of itemMaxCols.
                for (let c of this._columns.slice(0, col).concat(this._columns.slice(col + numCols))) {
                    if (tempRange.end < tempRange.start) {
                        break
                    }

                    tempRange.end = Math.min(tempRange.end, c.yBase + c.height)
                }

                if (tempRange.end < tempRange.start) {
                    continue
                }

                // This solution is *almost* valid -- but we're not out of the woods yet. We still
                // need to check that we aren't adding too many duplicate ranges on top of these
                // columns.
                
                let c = this._columns[col]
                let tooManyMulti = (c.after
                    // Only need to check 'c'; if this is valid and c has no items, neither does
                    // anything else.
                    && c.items.length === 0
                    && c.after.start === col
                    && c.after.numCols === numCols
                    && c.after.seqCount === this._maxSequentialMulti)
                
                if (tooManyMulti) {
                    continue
                }

                // We found a valid solution! Record this, with a position in the middle
                maxNumCols = numCols
                // Take the height as the midpoint of the range
                heightOfValid = (tempRange.start + tempRange.end) / 2
            }

            // If we did find a workable solution, then we're good!
            if (maxNumCols !== 0) {
                return { col, numCols: maxNumCols, cropHeight: heightOfValid }
            }
        }

        // If we get here, we didn't find a solution -- this is most likely my error.
        throw `failed to determine item placement`
    }

    // Returns the range of heights that the column (given by index) could crop its items to fit
    //
    // This won't include cropping/shifting prior multi-column items, but that's ok; doing so would
    // be extraordinarily complicated.
    //
    // The returned range has type: { start: int, end: int }
    _columnCropRange(c) {
        let col = this._columns[c]

        if (col.items.length == 0) {
            let h = col.height + col.yBase
            return { start: h, end: h }
        }

        // remember: column height includes trailing padding.
        let padHeight = this._padding * col.items.length
        let itemsHeight = col.height - padHeight

        return {
            start: col.yBase + itemsHeight * (1 - this._maxColumnCrop) + padHeight,
            // We use '... / (1 - crop)' instead of '... * (1 + crop)' because that'll shink the
            // width by at most 'crop'.
            end: col.yBase + itemsHeight / (1 - this._maxColumnCrop) + padHeight,
        }
    }

    // Crops all of the items in the column so that the total height matches 
    _cropColumnToHeight(c, height) {
        let col = this._columns[c]

        height -= col.yBase

        let padHeight = this._padding * col.items.length
        let itemsHeight = col.height - padHeight

        // Fractional amount to scale the height of each item by -- either cropping vertically
        // (scale < 1) or horizontally (scale > 1)
        let scale = (height - padHeight) / itemsHeight

        // Simple case
        if (scale === 1) {
            return
        } else if (scale <= 0) {
            throw 'cannot crop column: new height less than height due to padding'
        }

        let x = c * this._columnWidth + (c !== 0) * c * this._padding
        col.height = 0

        for (let { element, dims } of col.items) {
            let height = Math.round(dims.height * (this._columnWidth / dims.width) * scale)
            this._setItemAttrs(element, x, col.height + col.yBase, this._columnWidth, height)

            col.height += height + this._padding
        }
    }

    _setItemAttrs(element, x, y, width, height) {
        element.style.transform = `translateX(${x}px) translateY(${y}px)`
        element.style.width = `${width}px`
        element.style.height = `${height}px`
    }
}
