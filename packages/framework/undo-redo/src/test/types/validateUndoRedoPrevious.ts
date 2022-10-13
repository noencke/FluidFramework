/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/*
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY.
 * Generated by fluid-type-validator in @fluidframework/build-tools.
 */
import * as old from "@fluidframework/undo-redo-previous";
import * as current from "../../index";

type TypeOnly<T> = {
    [P in keyof T]: TypeOnly<T[P]>;
};

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IRevertible": {"forwardCompat": false}
*/
declare function get_old_InterfaceDeclaration_IRevertible():
    TypeOnly<old.IRevertible>;
declare function use_current_InterfaceDeclaration_IRevertible(
    use: TypeOnly<current.IRevertible>);
use_current_InterfaceDeclaration_IRevertible(
    get_old_InterfaceDeclaration_IRevertible());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "InterfaceDeclaration_IRevertible": {"backCompat": false}
*/
declare function get_current_InterfaceDeclaration_IRevertible():
    TypeOnly<current.IRevertible>;
declare function use_old_InterfaceDeclaration_IRevertible(
    use: TypeOnly<old.IRevertible>);
use_old_InterfaceDeclaration_IRevertible(
    get_current_InterfaceDeclaration_IRevertible());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedMapRevertible": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SharedMapRevertible():
    TypeOnly<old.SharedMapRevertible>;
declare function use_current_ClassDeclaration_SharedMapRevertible(
    use: TypeOnly<current.SharedMapRevertible>);
use_current_ClassDeclaration_SharedMapRevertible(
    get_old_ClassDeclaration_SharedMapRevertible());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedMapRevertible": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SharedMapRevertible():
    TypeOnly<current.SharedMapRevertible>;
declare function use_old_ClassDeclaration_SharedMapRevertible(
    use: TypeOnly<old.SharedMapRevertible>);
use_old_ClassDeclaration_SharedMapRevertible(
    get_current_ClassDeclaration_SharedMapRevertible());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedMapUndoRedoHandler": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SharedMapUndoRedoHandler():
    TypeOnly<old.SharedMapUndoRedoHandler>;
declare function use_current_ClassDeclaration_SharedMapUndoRedoHandler(
    use: TypeOnly<current.SharedMapUndoRedoHandler>);
use_current_ClassDeclaration_SharedMapUndoRedoHandler(
    get_old_ClassDeclaration_SharedMapUndoRedoHandler());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedMapUndoRedoHandler": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SharedMapUndoRedoHandler():
    TypeOnly<current.SharedMapUndoRedoHandler>;
declare function use_old_ClassDeclaration_SharedMapUndoRedoHandler(
    use: TypeOnly<old.SharedMapUndoRedoHandler>);
use_old_ClassDeclaration_SharedMapUndoRedoHandler(
    get_current_ClassDeclaration_SharedMapUndoRedoHandler());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedSegmentSequenceRevertible": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SharedSegmentSequenceRevertible():
    TypeOnly<old.SharedSegmentSequenceRevertible>;
declare function use_current_ClassDeclaration_SharedSegmentSequenceRevertible(
    use: TypeOnly<current.SharedSegmentSequenceRevertible>);
use_current_ClassDeclaration_SharedSegmentSequenceRevertible(
    // @ts-expect-error compatibility expected to be broken
    get_old_ClassDeclaration_SharedSegmentSequenceRevertible());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedSegmentSequenceRevertible": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SharedSegmentSequenceRevertible():
    TypeOnly<current.SharedSegmentSequenceRevertible>;
declare function use_old_ClassDeclaration_SharedSegmentSequenceRevertible(
    use: TypeOnly<old.SharedSegmentSequenceRevertible>);
use_old_ClassDeclaration_SharedSegmentSequenceRevertible(
    // @ts-expect-error compatibility expected to be broken
    get_current_ClassDeclaration_SharedSegmentSequenceRevertible());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedSegmentSequenceUndoRedoHandler": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler():
    TypeOnly<old.SharedSegmentSequenceUndoRedoHandler>;
declare function use_current_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler(
    use: TypeOnly<current.SharedSegmentSequenceUndoRedoHandler>);
use_current_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler(
    get_old_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_SharedSegmentSequenceUndoRedoHandler": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler():
    TypeOnly<current.SharedSegmentSequenceUndoRedoHandler>;
declare function use_old_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler(
    use: TypeOnly<old.SharedSegmentSequenceUndoRedoHandler>);
use_old_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler(
    get_current_ClassDeclaration_SharedSegmentSequenceUndoRedoHandler());

/*
* Validate forward compat by using old type in place of current type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_UndoRedoStackManager": {"forwardCompat": false}
*/
declare function get_old_ClassDeclaration_UndoRedoStackManager():
    TypeOnly<old.UndoRedoStackManager>;
declare function use_current_ClassDeclaration_UndoRedoStackManager(
    use: TypeOnly<current.UndoRedoStackManager>);
use_current_ClassDeclaration_UndoRedoStackManager(
    get_old_ClassDeclaration_UndoRedoStackManager());

/*
* Validate back compat by using current type in place of old type
* If breaking change required, add in package.json under typeValidation.broken:
* "ClassDeclaration_UndoRedoStackManager": {"backCompat": false}
*/
declare function get_current_ClassDeclaration_UndoRedoStackManager():
    TypeOnly<current.UndoRedoStackManager>;
declare function use_old_ClassDeclaration_UndoRedoStackManager(
    use: TypeOnly<old.UndoRedoStackManager>);
use_old_ClassDeclaration_UndoRedoStackManager(
    get_current_ClassDeclaration_UndoRedoStackManager());
