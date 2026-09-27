#!/usr/bin/env python3
"""ONNX-Gewichte als float16 speichern (+Cast nach float32) – halbiert die Dateigröße, Rechnung bleibt float32.
Optional: Eingangs-Höhe/Breite dynamisch machen.  Aufruf: fp16w.py in.onnx out.onnx [--dyn]"""
import sys, onnx, numpy as np
from onnx import numpy_helper, helper, TensorProto
src, dst = sys.argv[1], sys.argv[2]
m = onnx.load(src); g = m.graph
if '--dyn' in sys.argv:
    for v in list(g.input) + list(g.output):
        dims = v.type.tensor_type.shape.dim
        if len(dims) == 4:
            dims[2].dim_param = 'h'; dims[3].dim_param = 'w'
used = set(i for n in g.node for i in n.input)
inits, casts = [], []
for t in g.initializer:
    if t.name not in used: continue
    a = numpy_helper.to_array(t)
    if a.dtype == np.float32 and a.size >= 64:
        inits.append(numpy_helper.from_array(a.astype(np.float16), t.name + '_h'))
        casts.append(helper.make_node('Cast', [t.name + '_h'], [t.name], to=TensorProto.FLOAT))
    else:
        inits.append(t)
del g.initializer[:]; g.initializer.extend(inits)
nodes = list(g.node); del g.node[:]; g.node.extend(casts + nodes)
onnx.checker.check_model(m); onnx.save(m, dst)
print(dst)
