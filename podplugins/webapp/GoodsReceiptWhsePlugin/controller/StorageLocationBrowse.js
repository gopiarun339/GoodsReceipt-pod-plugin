sap.ui.define([
    "sap/dm/dme/controller/BrowseBase"
], function (BrowseBase) {
    "use strict";

    let StorageLocationBrowseType = BrowseBase.extend("Arun.ext.viewplugins.GoodsReceiptWhsePlugin.controller.StorageLocationBrowse", {

        /**
         * @override
         */
        createResultData: function (oBindingContext) {
            return {
                ref: oBindingContext.getProperty("id"),
                name: oBindingContext.getProperty("storageLocation"),
                isEwmManagedStorageLocation: oBindingContext.getProperty("isEwmManagedStorageLocation")
            };
        }
    });

    return {

        /**
         * Instantiates and opens value help dialog.
         * @param {sap.ui.core.Element} oParentControl - value help dialog will be set as dependent to it.
         * @param {String} sDefaultSearchValue - default value placed in a search field and a list is filtered by.
         * @param fnSelectionCallback - callback function called when user selects item in a list.
         */
        open: function (oParentControl, sDefaultSearchValue, fnSelectionCallback, oModel) {
            return new StorageLocationBrowseType("storageLocationBrowse", {
                oModel: oModel,
                sFragmentName: "Arun.ext.viewplugins.GoodsReceiptWhsePlugin.view.fragment.StorageLocationsBrowse",
                oParentControl: oParentControl,
                sDefaultSearchValue: sDefaultSearchValue,
                fnSelectionCallback: fnSelectionCallback,
                oFilterSettings: {
                    aLiveSearchProperties: ["storageLocation"]
                }
            });
        }
    };
});