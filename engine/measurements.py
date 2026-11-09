"""Measurement helpers with explicit undefined-value handling."""
def linear_cka(matrix):
    # matrix: samples x layers x hidden; biased CKA for descriptive use.
    grams = []
    for k in range(matrix.shape[1]):
        x = matrix[:, k] - matrix[:, k].mean(0)
        grams.append(x @ x.T)
    return [[float(((a*b).sum()/(a.norm()*b.norm())).clamp(0, 1))
             if matrix.shape[0] >= 4 and a.norm() > 1e-12 and b.norm() > 1e-12 else None
             for b in grams] for a in grams]
