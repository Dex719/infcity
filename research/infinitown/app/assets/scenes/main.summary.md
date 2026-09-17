# main.json — сводка (scene export из Unity)

geometries: 29, materials: 38, textures: 50, images: 50, binary: true

## Геометрии (буферы в main.bin, offsets = [start,end] байт)

| name | verts | tris | attrs |
|---|---|---|---|
| Road_Lane_01 | 108 | 58 | index/position/normal/tangent/uv |
| Road_Lane_03 | 177 | 114 | index/position/normal/tangent/uv |
| Road_Intersection_03_merged | 4635 | 2458 | index/position/normal/tangent/uv/uv2 |
| Road_Intersection_05 | 146 | 68 | index/position/normal/tangent/uv/uv2 |
| Props_Hydrant | 400 | 228 | index/position/normal/tangent/uv |
| (unnamed, block) | 7738 | 3966 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 10007 | 5040 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 9270 | 4936 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 12301 | 6512 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 16276 | 6982 | index/position/normal/tangent/uv/uv2 |
| block_6_merged | 9778 | 5070 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 7291 | 3693 | index/position/normal/tangent/uv/uv2 |
| block_8_merged | 13718 | 7122 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 9075 | 4656 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 8577 | 4308 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 9717 | 4262 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 12094 | 4442 | index/position/normal/tangent/uv/uv2 |
| (unnamed, block) | 12808 | 4814 | index/position/normal/tangent/uv/uv2 |
| Vehicle_Ambulance | 1010 | 627 | index/position/normal/tangent/uv |
| Vehicle_Bus | 1270 | 796 | index/position/normal/tangent/uv |
| Vehicle_Car | 1287 | 748 | index/position/normal/tangent/uv/color |
| Vehicle_Container | 1107 | 634 | index/position/normal/tangent/uv |
| Vehicle_Pick up Truck | 1269 | 694 | index/position/normal/tangent/uv |
| Vehicle_Police Car | 1309 | 760 | index/position/normal/tangent/uv/color |
| Vehicle_SUV | 1155 | 624 | index/position/normal/tangent/uv |
| Vehicle_Taxi | 1300 | 760 | index/position/normal/tangent/uv/color |
| Vehicle_Truck | 1133 | 656 | index/position/normal/tangent/uv |
| Cloud_cumulus_Mid | 981 | 354 | index/position/normal/tangent |
| Cloud_cumulus | 941 | 332 | index/position/normal/tangent |

## Материалы (все customType=PBRMaterial → ShaderMaterial)

| name | color | gloss | metal | ao | transparent |
|---|---|---|---|---|---|
| Road | #ffffff | 0.5 | 0 | 1 | false |
| intersection_03_merged-mat-_MainTex-atlas0 | #ffffff | 0.5 | 0 | 1 | false |
| Props_Props_01 | #ffffff | 0.5 | 0 | 1 | false |
| block1_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block2_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block3_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block4_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block5_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block6_merged-mat-_MainTex-atlas0 | #ffffff | 0 | 0 | 1 | false |
| block7_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block8_merged-mat-_MainTex-atlas0 | #ffffff | 0 | 0 | 1 | false |
| block9_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block10_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| block11_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| park_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| park2_merged-mat | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Ambulance | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Bus_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Bus_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Bus_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Car_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Car_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Car_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Container_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Container_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Container_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Pick up Truck_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Pick up Truck_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Pick up Truck_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Police Car | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_SUV_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_SUV_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_SUV_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Taxi | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Truck_color01 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Truck_color02 | #ffffff | 0.5 | 0 | 1 | false |
| Vehicle_Truck_color03 | #ffffff | 0.5 | 0 | 1 | false |
| Cloud_cumulus | #e1e1e1 | 0 | 0 | 1 | true |

## Images

- Maps/Textures/Road.jpg
- Materials/merged/intersection_03_merged-mat-_MainTex-atlas0.jpg
- Maps/Textures/Props_Props_01.jpg
- Materials/merged/block1_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block1_ao.jpg
- Materials/merged/block2_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block2_ao.jpg
- Materials/merged/block3_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block3_merged_mat_ao.jpg
- Materials/merged/block4_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block4_merged_mat_ao.jpg
- Materials/merged/block5_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block5_merged_mat_ao.jpg
- Materials/merged/block6_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block6_merged_mat_ao.jpg
- Materials/merged/block7_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block7_merged_mat_ao.jpg
- Materials/merged/block8_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block8_merged_mat_ao.jpg
- Materials/merged/block9_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block9_merged_mat_ao.jpg
- Materials/merged/block10_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block10_merged_mat_ao.jpg
- Materials/merged/block11_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/block11_merged_mat_ao.jpg
- Materials/merged/park_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/park_3_ao.jpg
- Materials/merged/park2_merged-mat-_MainTex-atlas0.jpg
- Maps/AO/park2_merged_mat_ao.jpg
- Maps/Textures/Vehicle_Ambulance.jpg
- Maps/Textures/Vehicle_Bus_1.jpg
- Maps/Textures/Vehicle_Bus_2.jpg
- Maps/Textures/Vehicle_Bus_3.jpg
- Maps/Textures/Vehicle_Car_1.jpg
- Maps/Textures/Vehicle_Car_2.jpg
- Maps/Textures/Vehicle_Car_3.jpg
- Maps/Textures/Vehicle_Container_1.jpg
- Maps/Textures/Vehicle_Container_2.jpg
- Maps/Textures/Vehicle_Container_3.jpg
- Maps/Textures/Vehicle_Pick up Truck_1.jpg
- Maps/Textures/Vehicle_Pick up Truck_2.jpg
- Maps/Textures/Vehicle_Pick up Truck_3.jpg
- Maps/Textures/Vehicle_Police Car.jpg
- Maps/Textures/Vehicle_SUV_1.jpg
- Maps/Textures/Vehicle_SUV_2.jpg
- Maps/Textures/Vehicle_SUV_3.jpg
- Maps/Textures/Vehicle_Taxi.jpg
- Maps/Textures/Vehicle_Truck_1.jpg
- Maps/Textures/Vehicle_Truck_2.jpg
- Maps/Textures/Vehicle_Truck_3.jpg

## Дерево object (глубина 2)
```
Scene main (9)
  PerspectiveCamera Main Camera
  DirectionalLight Directional Light
  Object3D lanes (2)
    Mesh Road_Lane_01_fixed
    Mesh Road_Lane_03_fixed
  Object3D intersections (3)
    Mesh Road_Intersection_03_merged_fixed
    Mesh Road_Intersection_05
    Mesh Road_Intersection_04_fixed (2)
  Object3D blocks (13)
    Mesh block_1_merged
    Mesh block_2_merged
    Mesh block_3_merged
    Mesh block_4_merged
    Mesh block_5_merged
    Mesh block_6_merged
    Mesh block_7_merged
    Mesh block_8_merged
    Mesh block_9_merged
    Mesh block_10_merged
    Mesh block_11_merged
    Mesh park_3_merged
    Mesh park_2_merged
  Object3D cars (21)
    Mesh Vehicle_Ambulance
    Mesh Vehicle_Bus_color01
    Mesh Vehicle_Bus_color02
    Mesh Vehicle_Bus_color03
    Mesh Vehicle_Car_color01
    Mesh Vehicle_Car_color02
    Mesh Vehicle_Car_color03
    Mesh Vehicle_Container_color01
    Mesh Vehicle_Container_color02
    Mesh Vehicle_Container_color03
    Mesh Vehicle_Pick up Truck_color01
    Mesh Vehicle_Pick up Truck_color02
    Mesh Vehicle_Pick up Truck_color03
    Mesh Vehicle_Police Car
    Mesh Vehicle_SUV_color01
    Mesh Vehicle_SUV_color02
    Mesh Vehicle_SUV_color03
    Mesh Vehicle_Taxi
    Mesh Vehicle_Truck_color01
    Mesh Vehicle_Truck_color02
    Mesh Vehicle_Truck_color03
  Object3D clouds (5)
    Mesh Cloud_Cumulus_Med
    Mesh Cloud_Cumulus (1)
    Mesh Cloud_Cumulus (2)
    Mesh Cloud_Cumulus
    Mesh Cloud_Cumulus_Med (1)
  Object3D bakers (14)
    Object3D block_1_baker (1)
    Object3D block_2_baker (1)
    Object3D block_3_baker (1)
    Object3D block_4_baker (1)
    Object3D block_5_baker (1)
    Object3D block_6_baker (1)
    Object3D block_7_baker (1)
    Object3D block_8_baker (1)
    Object3D block_9_baker (1)
    Object3D block_10_baker (1)
    Object3D block_11_baker (1)
    Object3D park_3_baker (1)
    Object3D park_2_baker (1)
    Object3D Intersection_03_baker (1)
  Object3D CombinedMesh-MeshBaker-mesh
```