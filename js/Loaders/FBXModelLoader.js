/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import * as THREE from 'three';
import extractURL from '../Utils/extractURL';
import type {UIView} from 'ovrui';
import type {Material} from 'three';

import FBXLoader from 'three-fbx-loader';
import fetchResource from '../Utils/fetchResource';
import RefCountCache from '../Utils/RefCountCache';

FBXLoader(THREE)

function recursiveDispose(node) {
  if (typeof node.dispose === 'function') {
    node.dispose();
  }
  if (node.geometry) {
    node.geometry.dispose();
  }
  if (node.material) {
    node.material.dispose();
  }
  for (const child of node.children) {
    recursiveDispose(child);
  }
}

const fbxStateCache: RefCountCache<any> = new RefCountCache(
  function(url, entry) {
    recursiveDispose(entry.scene);
  }
);

const loadList = {};

class FBXMeshInstance {
  url: string;
  parent: any;
  scene: any;
  mixer: any;
  timeStamp: number;
  activeAnimations: any;
  allAnimations: any;
  animationParams: any;

  constructor(definition: any, parent: UIView) {
    this.url = extractURL(definition.fbx) || '';
    this.parent = parent;
    this.mixer = null;
    this.timeStamp = -1;
    this.activeAnimations = {};
    this.allAnimations = {};
    this.animationParams = this.parseAnimationParams(definition);

    const onLoad = fbx => {
      this.mixer = new THREE.AnimationMixer(fbx);
      const params = this.animationParams;
      const animationAction = this.mixer.clipAction(fbx.animations[0]);
      if (params.play) {
        // patch animation settings
        const fadeIn = !!params.fadeTime? params.fadeTime : 0;
        const timeScale = !!params.timeScale ? params.timeScale : 1;
        const weight = !!params.weight ? params.weight : 1;
        animationAction.fadeIn = fadeIn;
        animationAction.timeScale = timeScale;
        animationAction.weight = weight;
        animationAction.play();
      }

      requestAnimationFrame(() => {
        parent.add(fbx);
      });
    }

    const manager = new THREE.LoadingManager();
    // $FlowFixMe
    const loader = new THREE.FBXLoader(manager);
    loader.load(
      this.url,
      fbx => {
        onLoad(fbx);
      },
      () => {},
      () => {
        console.error('failed to load FBX', this.url);
        delete loadList[this.url];
      }
    );
  }

  parseAnimationParams(definition: any): any {
    const defaultParam = {
      play: false,
      timeScale: 0,
    };
    if (!!definition) {
      return definition.animations || defaultParam;
    }
    return defaultParam;
  }

  updateAnimation(definition: any): void {
    if (!definition.animations || definition.animations.length === 0) {
      if (this.mixer) {
        this.activeAnimations = {};
        this.mixer.stopAllAction();
      }
      return;
    }
    // stop any leftover animations
    const newActiveAnimations = {};
    for (const key in definition.animations) {
      const animName = 'animation_' + key;
      newActiveAnimations[animName] = true;
      // start animations which have yet to be started
      if (this.allAnimations[animName]) {
        const anim = this.allAnimations[animName];
        const params = definition.animations[key];
        if (params) {
          anim.fadeIn(params.fadeTime ? params.fadeTime : 0);
          anim.setEffectiveTimeScale(params.timeScale ? params.timeScale : 1);
          anim.setEffectiveWeight(params.weight ? params.weight : 1);
          if (params.syncWith && this.allAnimations[params.syncWith]) {
            anim.syncWith(this.allAnimations[params.syncWith]);
          }
        }

        if (!this.activeAnimations[animName]) {
          anim.play();
        }
      }
      delete this.activeAnimations[animName];
    }
    // stop any leftover animations
    for (const key in this.activeAnimations) {
      if (this.allAnimations[key]) {
        this.allAnimations[key].stop();
      }
    }
    this.activeAnimations = newActiveAnimations;
  }

  update(definition: any): boolean {
    // we can update some params without the need to reload the instance
    // if the url is the same let's assume the model hasn't changed
    const newUrl = extractURL(definition.gltf2) || '';
    if (newUrl !== this.url) {
      return false;
    }
    // apply animation changes
    this.updateAnimation(definition);
    return true;
  }

  frame(timeStampMS: number, deltaTimeMS: number): void {
    if (this.mixer) {
      this.mixer.update(deltaTimeMS * 0.001);
    }
  }

  // already established apis
  setLit(flag: boolean): void {
    if (__DEV__) {
      console.log('Lit mode is not supported for FBX models');
    }
  }

  setTexture(value: string): void {
    if (__DEV__) {
      console.log('Texture mode is not supported for FBX models');
    }
  }

  setWireframe(value: boolean): void {
    if (__DEV__) {
      console.log('Wireframe mode is not supported for FBX models');
    }
  }

  dispose(): void {
    if (this.scene) {
      fbxStateCache.removeReference(this.url);
      this.parent.remove(this.scene);
      delete this.scene;
    }
  }
}

export default class FBXModelLoader {
  // returns true if the loader can create an instance from this definition
  canLoad(definition: any): boolean {
    return definition && definition.hasOwnProperty('fbx');
  }

  // create the instance
  createInstance(
    definition: any,
    parent: UIView,
    litMaterial: Material,
    unlitMaterial: Material
  ): GLTF2MeshInstance {
    return new FBXMeshInstance(definition, parent);
  }
}
